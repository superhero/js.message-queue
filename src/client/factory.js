const
  MessageQueueClient  = require('.'),
  RedisFactory        = require('@superhero/core.redis/src/client/factory')

/**
 * @memberof MessageQueue
 */
class ClientFactory
{
  constructor(console, channel, deepmerge)
  {
    this.console    = console
    this.channel    = channel
    this.deepmerge  = deepmerge
  }

  /**
   * @returns {MessageQueueClient}
   */
  create(options)
  {
    const
      redisFactory  = new RedisFactory(),
      redis         = redisFactory.create(this.console, options),
      publisher     = redis.createSession(),
      subscriber    = redis.createSession()

    return new MessageQueueClient(this.console, this.channel, redis, publisher, subscriber, this.deepmerge)
  }
}

module.exports = ClientFactory
