/**
 * @namespace Eventsource.Test
 */
module.exports =
{
  core:
  {
    bootstrap:
    {
      'eventsource/client/consumer' : false
    }
  },
  client:
  {
    'message-queue':
    {
      domain  : 'test'
    }
  }
}