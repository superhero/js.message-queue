/**
 * @namespace MessageQueue
 */
module.exports =
{
  core:
  {
    bootstrap:
    {
      'message-queue/consumer'  : 'message-queue/consumer'
    },
    dependency:
    {
      'message-queue/client'    : __dirname + '/../client',
    },
    locator:
    {
      'message-queue/consumer'  : __dirname
    }
  }
}
