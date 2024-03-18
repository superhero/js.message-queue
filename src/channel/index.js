/**
 * @memberof MessageQueue
 */
class Channel
{
  MESSAGE_CONSUMER_ERROR    = 'consumer-error'
  MESSAGE_QUEUED            = 'queued'
  MESSAGE_QUEUED_ERROR      = 'queued-error'
  MESSAGE_SCHEDULED         = 'scheduled'
  MESSAGE_SCHEDULED_CLEARED = 'scheduled-cleared'
  MESSAGE_DATA              = 'data'

  messageIndexed(domain, pid)
  {
    return `idx:${domain}:${pid}`
  }

  messageLog(domain, pid)
  {
    return `log:${domain}:${pid}`
  }
}

module.exports = Channel
