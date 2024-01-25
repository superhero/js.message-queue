/**
 * @memberof MessageQueue
 */
class Consumer
{
  constructor(config, client, locator, string, console)
  {
    this.config   = config
    this.client   = client
    this.locator  = locator
    this.string   = string
    this.console  = console
  }
  
  async bootstrap()
  {
    const { domain, name } = this.config

    this.console.color('blue').log('✔ message queue consume › ' + domain + ' › ' + name)

    await this.client.consume(domain, name, async (message) =>
    {
      this.console.color('blue').log('⁉ ' + message.pid + ' › ' + message.domain + ' › ' + message.name)

      let service

      try
      {
        service = this.locator.locate(message.domain)
      }
      catch(error)
      {
        this.console.color('red').log('✗ ' + message.pid + ' › ' + message.domain + ' › ' + message.name + ' » can not locate service')
        return
      }

      const
        channel = message.name.replace('.', '_').replace('-', ' '),
        action  = this.string.composeCamelCase('on ' + channel, ' ')

      if(action in service)
      {
        try
        {
          await service[action](message)
          this.console.color('green').log('✔ ' + message.pid + ' › ' + message.domain + ' › ' + message.name)
        }
        catch(error)
        {
          try
          {
            this.console.color('red').log('✗ ' + message.pid + ' › ' + message.domain + ' › ' + message.name)
            await service.onError(message, error)
          }
          catch(previousError)
          {
            this.console.color('red').log('✗ ' + message.pid + ' › ' + message.domain + ' › ' + message.name + ' » service failed to handle error')
            const error = new Error('message queue consumer failed')
            error.code  = 'E_MESSAGE_QUEUE_CONSUMER_FAILED_TO_HANDLE_ERROR'
            error.chain = { previousError, channel, action, message }
            throw error
          }
        }
      }
      else
      {
        this.console.color('red').log('✗ ' + message.pid + ' › ' + message.domain + ' › ' + message.name + ' » action is not supported by the service')
      }
    })
  }
}

module.exports = Consumer
