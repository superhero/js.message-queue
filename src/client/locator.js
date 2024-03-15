const
  MessageQueueClient        = require('.'),
  MessageQueueClientFactory = require('./factory'),
  LocatorConstituent        = require('superhero/core/locator/constituent')

/**
 * @memberof MessageQueue
 * @extends {superhero/core/locator/constituent}
 */
class ClientLocator extends LocatorConstituent
{
  /**
   * @returns {MessageQueueClient}
   */
  locate()
  {
    const
      channel       = this.locator.locate('message-queue/channel'),
      console       = this.locator.locate('core/console'),
      configuration = this.locator.locate('core/configuration'),
      deepmerge     = this.locator.locate('core/deepmerge'),
      factory       = new MessageQueueClientFactory(console, channel, deepmerge),
      options       = configuration.find('client/message-queue/redis'),
      client        = factory.create(options)

    return client
  }
}

module.exports = ClientLocator
