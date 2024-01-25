const
  MessageQueueConsumer  = require('.'),
  LocatorConstituent    = require('superhero/core/locator/constituent')

/**
 * @memberof MessageQueue.Client
 * @extends {superhero/core/locator/constituent}
 */
class ConsumerLocator extends LocatorConstituent
{
  /**
   * @returns {MessageQueueConsumer}
   */
  locate()
  {
    const
      client            = this.locator.locate('message-queue/client'),
      string            = this.locator.locate('core/string'),
      console           = this.locator.locate('core/console'),
      configuration     = this.locator.locate('core/configuration'),
      { domain, name }  = configuration.find('client/message-queue')

    return new MessageQueueConsumer({ domain, name }, client, this.locator, string, console)
  }
}

module.exports = ConsumerLocator
