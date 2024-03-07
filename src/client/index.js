/**
 * @memberof MessageQueue.Client
 */
class MessageQueueClient
{
  constructor(console, channel, redis, publisher, subscriber)
  {
    this.console    = console
    this.channel    = channel
    this.redis      = redis
    this.publisher  = publisher
    this.subscriber = subscriber
  }

  async bootstrap()
  {
    await Promise.all(
    [
      this.redis.connection.connect(),
      this.publisher.connection.connect(),
      this.subscriber.connection.connect()
    ])

    this.console.color('green').log('✔ message queue - redis sockets connected')

    await Promise.all(
    [
      this.redis.bootstrap(),
      this.publisher.bootstrap(),
      this.subscriber.bootstrap()
    ])

    this.console.color('green').log('✔ message queue - redis services are bootstrapped')

    await this.subscriber.pubsub.subscribe(this.channel.MESSAGE_QUEUED, this.onMessageQueued.bind(this))
    this.console.color('green').log('✔ subscribing to the message queued channel')

    await this.subscriber.pubsub.subscribe(this.channel.MESSAGE_SCHEDULED, this.onMessageScheduled.bind(this))
    this.console.color('green').log('✔ subscribing to the message scheduled channel')

    await this.subscriber.pubsub.subscribe(this.channel.MESSAGE_SCHEDULED_CLEARED, this.onMessageScheduledCleared.bind(this))
    this.console.color('green').log('✔ subscribing to the cleared scheduled channel')

    await this.scheduleNextMessageToBePersisted()
  }

  async quit()
  {
    await Promise.all(
    [
      this.redis.connection.quit(),
      this.publisher.connection.quit(),
      this.subscriber.connection.quit()
    ])

    this.console.color('green').log('✔ message queue - redis sockets closed')
  }

  /**
   * @param {MessageQueue.Schema.EntityMessage} message 
   * @param {MessageQueue.Schema.EntityMessage} [referer] the message that preceeded 
   * the message now being written, to be extended by the current message and set 
   * the referer id called "rid" in the meta value object
   * @param {boolean} [broadcast=true]
   */
  async write(message, referer, broadcast)
  {
    try
    {
      const composedMessage = this.composeMessage(message, referer, broadcast)
      const id = await this.redis.stream.write(this.channel.MESSAGE_QUEUED, composedMessage)
      await this.publisher.pubsub.publish(this.channel.MESSAGE_QUEUED, { id })
      return id
    }
    catch(previousError)
    {
      const error = new Error('failed to write the message to the message queue')
      error.code  = 'E_MESSAGE_QUEUE_CLIENT_WRITE'
      error.chain = { previousError, message, referer, broadcast }
      throw error
    }
  }

  async onMessageQueued()
  {
    if(false === !!this._consumingMessageQueue)
    {
      try
      {
        this._consumingMessageQueue = true
        const channel = this.channel.MESSAGE_QUEUED
        await this.redis.stream.lazyloadConsumerGroup(channel, channel)
        while(await this.redis.stream.readGroup(channel, channel, this.onQueuedMessageConsumed.bind(this)));
      }
      catch(error)
      {
        await this.onMessageQueuedError(error)
      }
      finally
      {
        this._consumingMessageQueue = false
      }
    }
  }

  async onQueuedMessageConsumed(id, message)
  {
    const broadcast = message.broadcast === undefined ? true : !!message.broadcast
    const { domain, pid, name } = message

    await this.indexMessage(id, message, broadcast)

    if(broadcast)
    {
      const channel = this.channel.messageIndexed(domain, name)
      await this.redis.stream.write(channel, { id, pid })
      await this.publisher.pubsub.publish(channel, { id, pid })
    }

    this.console.color('green').log(`✔ ${pid} → ${domain}/${name} → ${id} → broadcasted: ${broadcast ? 'yes' : 'no'}`)
  }

  /**
   * @param {number} id 
   * @param {MessageQueue.Schema.EntityMessage } message
   */
  async indexMessage(id, message)
  {
    const { timestamp, domain, pid, name } = message

    try
    {
      await this.redis.hash.write(this.channel.MESSAGE_DATA, id, message)
      const channel = this.channel.messageLog(domain, pid)
      const score = new Date(timestamp).getTime()
      await this.redis.ordered.write(channel, id, score)
      await this.redis.stream.delete(this.channel.MESSAGE_QUEUED, id)
    }
    catch(previousError)
    {
      const error = new Error(`failed to index ${domain}/${name}/${pid}`)
      error.code  = 'E_MESSAGE_QUEUE_INDEX_MESSAGE'
      error.chain = { previousError, id, message }
      throw error
    }
  }

  async onMessageQueuedError(error)
  {
    this.console.color('red').log('✗ message queued error code: ' + (error.code || 'no error code provided'))
    const id = await this.redis.stream.write(this.channel.MESSAGE_QUEUED_ERROR, error)
    await this.publisher.pubsub.publish(this.channel.MESSAGE_QUEUED_ERROR, { id })
  }

  /**
   * schedule the next message in the schedule queue to be persisted in the message queue
   */
  async scheduleNextMessageToBePersisted()
  {
    const minimum = true
    const timestamp = await this.redis.ordered.readScore(this.channel.MESSAGE_SCHEDULED, minimum)
    timestamp && this.onMessageScheduled(timestamp)
  }

  /**
   * @param {string|number} timestamp value representing the time when the message should be persisted
   * @param {MessageQueue.Schema.EntityMessage} message 
   * @param {MessageQueue.Schema.EntityMessage} [referer] the message that preceeded 
   * the message now being written, to be extended by the current message and set 
   * the referer id called "rid" in the meta value object
   */
  async schedule(timestamp, message, referer)
  {
    try
    {
      const score           = new Date(timestamp).getTime()
      const composedMessage = this.composeMessage(message, referer)

      await this.redis.ordered.write(this.channel.MESSAGE_SCHEDULED, composedMessage, score)
      await this.publisher.pubsub.publish(this.channel.MESSAGE_SCHEDULED, score)

      this.console.color('green').log('✔ message scheduled')
    }
    catch(previousError)
    {
      const error = new Error('failed to schedule the message')
      error.code  = 'E_MESSAGE_QUEUE_CLIENT_SCHEDULE'
      error.chain = { previousError, timestamp, message, referer }
      throw error
    }
  }

  /**
   * Handles the scheduling of a process with the given timestamp.
   * If an earlier task is already scheduled, logs a message and returns.
   * Otherwise, updates the schedule queue and sets a timeout for the process.
   *
   * @param {string|number} timestamp - The timestamp for the scheduled process.
   */
  async onMessageScheduled(timestamp)
  {
    const oldTimestamp = new Date(this._scheduleTimestamp).toJSON()
    const newTimestamp = new Date(timestamp).toJSON()

    if(this._scheduleTimestamp && this._scheduleTimestamp <= timestamp)
    {
      this.console.color('yellow').log(`- an earlier scheduled message is already queued: ${oldTimestamp}, compared to the new message: ${newTimestamp}`)
      return
    }

    this.console.color('green').log(`✔ updating schedule queue to ${newTimestamp} from ${oldTimestamp}`)

    this._scheduleTimestamp = timestamp

    const timeout = Math.max(0, this._scheduleTimestamp - Date.now())
    clearTimeout(this._scheduleTimeoutId)
    this._scheduleTimeoutId = setTimeout(async () =>
    {
      this.console.color('green').log(`✔ scheduled message triggered: ${this._scheduleTimestamp}`)
      delete this._scheduleTimestamp
      await this.persistTimedoutScheduledMessages()
      await this.scheduleNextMessageToBePersisted()
    }, timeout)
  }

  async persistTimedoutScheduledMessages()
  {
    try
    {
      const scheduledChannel = this.channel.MESSAGE_SCHEDULED
      const session          = this.redis.createSession()

      await session.auth()

      let list

      do
      {
        try
        {
          const now = Date.now()
          await session.transaction.watch(scheduledChannel)
          await session.transaction.begin()
          list = await this.redis.ordered.read(scheduledChannel, 0, now)
          await session.ordered.delete(scheduledChannel, 0, now)
          await session.transaction.commit()

          this.console.color('green').log(`✔ ${list.length} scheduled messages persisted`)
        }
        catch(error)
        {
          this.console.color('red').log(error)
          await session.transaction.roleback()
          list = undefined
        }
      }
      while(list === undefined)

      await session.connection.quit()

      for(const message of list)
      {
        try
        {
          const id = await this.redis.stream.write(this.channel.MESSAGE_QUEUED, message)
          await this.publisher.pubsub.publish(this.channel.MESSAGE_QUEUED, { id })
          const timestamp = new Date(message.timestamp).toJSON()
          this.console.color('cyan').log(`✔ ${message.domain}/${message.name}/${message.pid} → scheduled message queued ${timestamp}`)
        }
        catch(error)
        {
          await this.onScheduledError(error)
        }
      }
    }
    catch(error)
    {
      await this.onScheduledError(error)
    }
  }

  async onScheduledError(error)
  {
    this.console.color('red').log('✗ scheduled message error code: ' + error.code || 'no error code provided')
    const id = await this.redis.stream.write(this.channel.MESSAGE_QUEUED_ERROR, error)
    await this.publisher.pubsub.publish(this.channel.MESSAGE_QUEUED_ERROR, { id })
  }

  /**
   * clear scheduled message queue, optinally by defined timestamp range
   * @param {string} [min=-inf]
   * @param {string} [max=+inf]
   */
  async clearSchedule(min='-inf', max='+inf')
  {
    try
    {
      await this.redis.ordered.delete(this.channel.MESSAGE_SCHEDULED, min, max)
      await this.publisher.pubsub.publish(this.channel.MESSAGE_SCHEDULED_CLEARED)
    }
    catch(previousError)
    {
      const error = new Error('failed to clear the scheduled message queue')
      error.code  = 'E_MESSAGE_QUEUE_CLIENT_CLEAR_SCHEDULE'
      error.chain = { previousError, min, max }
      throw error
    }
  }

  async onMessageScheduledCleared()
  {
    clearTimeout(this._scheduleTimeoutId)
    await this.scheduleNextMessageToBePersisted()
  }

  /**
   * @param {string} id
   */
  async readMessage(id)
  {
    let message

    try
    {
      message = await this.redis.hash.read(this.channel.MESSAGE_DATA, id)
    }
    catch(previousError)
    {
      const error = new Error('could not read the message')
      error.code  = 'E_MESSAGE_QUEUE_CLIENT_READ_MESSAGE'
      error.chain = { id }
      throw error
    }

    if(message)
    {
      message.id = id
      return message
    }
    else
    {
      const error = new Error('message not found')
      error.code  = 'E_MESSAGE_QUEUE_CLIENT_READ_MESSAGE_NOT_FOUND'
      error.chain = { id }
      throw error
    }
  }

  /**
   * @param {string} id
   */
  async deleteMessage(id)
  {
    try
    {
      return await this.redis.hash.delete(this.channel.MESSAGE_DATA, id)
    }
    catch(previousError)
    {
      const error = new Error('could not delete the message')
      error.code  = 'E_MESSAGE_QUEUE_CLIENT_DELETE_MESSAGE'
      error.chain = { previousError, id }
      throw error
    }
  }

  /**
   * @param {string} domain
   * @param {string} pid process id
   * @param {string} [from] timestamp
   * @param {string} [to] timestamp
   * @returns {array}
   */
  async readMessageLog(domain, pid, from, to)
  {
    try
    {
      const
        channel     = this.channel.messageLog(domain, pid),
        scoreFrom   = from  && new Date(from).getTime(),
        scoreTo     = to    && new Date(to).getTime(),
        history     = await this.redis.ordered.read(channel, scoreFrom, scoreTo),
        messageLog  = await Promise.all(history.map((id) => this.readMessage(id)))

      return messageLog
    }
    catch(previousError)
    {
      const error = new Error('problem when reading the message log')
      error.code  = 'E_MESSAGE_QUEUE_CLIENT_READ_MESSAGE_LOG'
      error.chain = { previousError, domain, pid }
      throw error
    }
  }

  async doesMessageLogExist(domainPattern, pidPattern)
  {
    try
    {
      const
        channel = this.channel.messageLog(domainPattern, pidPattern),
        keys    = this.redis.key.scan(channel)

      for await (const _ of keys) 
      {
        return true
      }

      return false
    }
    catch(previousError)
    {
      const error = new Error('problem when scanning for message loggs')
      error.code  = 'E_MESSAGE_QUEUE_CLIENT_DOES_MESSAGE_LOG_EXIST'
      error.chain = { previousError, domainPattern, pidPattern }
      throw error
    }
  }

  /**
   * @param {string} domain
   * @param {string} pid
   */
  async deleteMessageLog(domain, pid)
  {
    try
    {
      const messageLog = await this.readMessageLog(domain, pid)
      await Promise.all(messageLog.map((message) => this.deleteMessage(message.id)))
      const channel = this.channel.messageLog(domain, pid)
      await this.redis.key.delete(channel)
    }
    catch(previousError)
    {
      const error = new Error('problem when deleting the message log')
      error.code  = 'E_MESSAGE_QUEUE_CLIENT_DELETE_BY_PID'
      error.chain = { previousError, domain, pid }
      throw error
    }
  }

  filterMessageLogByName(messageLog, name)
  {
    return messageLog.filter((message) => message.name === name)
  }

  filterMessageLogByPpid(messageLog, ppid)
  {
    return messageLog.filter((message) => message.ppid === ppid)
  }

  hasMessage(messageLog, name)
  {
    const filteredMessageLog = this.filterMessageLogByName(messageLog, name)
    return filteredMessageLog.length > 0
  }

  composeMessageState(messageLog)
  {
    const state = {}
    messageLog.forEach((state, message) => this.deepmerge.merge(state, message.data))
    return state
  }

  composeMessage(message, referer, broadcast)
  {
    const timestamp = message.timestamp || new Date().toJSON()
    const { domain, name, pid, ppid, id } = referer || {}
    const composed = { domain, name, pid, ppid, broadcast, ...message, timestamp, rid:id }

    for(const key in composed)
    {
      if(composed[key] === undefined)
      {
        delete composed[key]
      }
    }

    return composed
  }

  /**
   * @param {string} domain 
   * @param {string} name 
   * @param {function} consumer 
   */
  async consume(domain, name, consumer)
  {
    const channel = this.channel.messageIndexed(domain, name)
    await this.subscriber.pubsub.subscribe(channel, this._consumeOnSubscribe.bind(this, consumer))
  }

  async _consumeOnSubscribe(consumer, subscriberDto, _, channel)
  {
    try
    {
      await this.redis.stream.lazyloadConsumerGroup(channel, channel)
      while(await this.redis.stream.readGroup(channel, channel, async (id, dto) =>
      {
        const message = await this.readMessage(dto.id)
        await consumer(message)
        await this.redis.stream.delete(channel, id)
      }));
    }
    catch(previousError)
    {
      const error = new Error('message queue consumer failed')
      error.code  = 'E_MESSAGE_QUEUE_CLIENT_CONSUME_ON_SUBSCRIBE'
      error.chain = { previousError, channel }
      await this.onConsumerError(error)
    }
  }

  async onConsumerError(error)
  {
    const channel = this.channel.MESSAGE_CONSUMER_ERROR
    this.console.color('red').log(`✗ ${channel}`, error)
    await this.redis.stream.write(channel, error)
    await this.publisher.pubsub.publish(channel)
  }

  /**
   * @param {string} domain 
   * @param {string} pid 
   * @param {string} happyPaths string or array of message names that should be acceptable
   * @param {string} [exceptionalPaths] string or array of message names that should be rejected as an exception/error
   * @param {number} [timeout=60e3] 
   * @throws E_MESSAGE_QUEUE_CLIENT_WAIT
   * @throws E_MESSAGE_QUEUE_CLIENT_WAIT_TIMEOUT
   * @throws E_MESSAGE_QUEUE_CLIENT_WAIT_EXCEPTION
   */
  async wait(domain, pid, happyPaths, exceptionalPaths, timeout=60e3)
  {
    if(false === Array.isArray(happyPaths))
    {
      happyPaths = [ happyPaths ]
    }
    if(false === Array.isArray(exceptionalPaths))
    {
      exceptionalPaths = [ exceptionalPaths ]
    }

    return new Promise(async (accept, reject) =>
    {
      try
      {
        const 
          messageNames  = [ ...happyPaths, ...exceptionalPaths ],
          session       = this.redis.createSession(),
          timeout_id    = setTimeout(async () => 
          {
            await session.connection.disconnect()
            const error = new Error('exceptional message triggered')
            error.code  = 'E_MESSAGE_QUEUE_CLIENT_WAIT_TIMEOUT'
            error.chain = { domain, pid, happyPaths, exceptionalPaths, timeout }
            reject(error)
          }, timeout)

        await session.auth()
  
        await Promise.all(messageNames.map((name) => 
        {
          const channel = this.channel.messageIndexed(domain, name)
          return session.pubsub.subscribe(channel, async (dto) =>
          {
            if(dto.pid !== pid)
            {
              return
            }

            try
            {
              clearTimeout(timeout_id)

              await session.connection.disconnect()
              const message = await this.readMessage(dto.id)

              if(happyPaths.includes(message.name))
              {
                accept(message)
              }
              else
              {
                const error = new Error('exceptional message triggered')
                error.code  = 'E_MESSAGE_QUEUE_CLIENT_WAIT_EXCEPTION'
                error.chain = { message }
                throw error
              }
            }
            catch(previousError)
            {
              const error = new Error('could not wait for the message to be written to the message queue')
              error.code  = 'E_MESSAGE_QUEUE_CLIENT_WAIT'
              error.chain = { previousError, domain, pid, name, dto, happyPaths, exceptionalPaths }
              reject(error)
            }
          })
        }))
      }
      catch(previousError)
      {
        const error = new Error('could not wait for the message to be written to the message queue')
        error.code  = 'E_MESSAGE_QUEUE_CLIENT_WAIT'
        error.chain = { previousError, domain, pid, happyPaths, exceptions }
        reject(error)
      }
    })
  }
}

module.exports = MessageQueueClient
