const
  MessageQueueChannel = require('.'),
  LocatorConstituent  = require('superhero/core/locator/constituent')

/**
 * @memberof MessageQueue
 * @extends {superhero/core/locator/constituent}
 */
class MessageQueueChannelLocator extends LocatorConstituent
{
  /**
   * @returns {MessageQueueChannel}
   */
  locate()
  {
    return new MessageQueueChannel
  }
}

module.exports = MessageQueueChannelLocator
