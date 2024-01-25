/**
 * @namespace MessageQueue
 */
module.exports =
{
  core:
  {
    dependency:
    {
      'client/redis'            : '@superhero/core.redis/src/client',
      'message-queue/client'    : __dirname + '/src/client',
      'message-queue/consumer'  : __dirname + '/src/consumer',
      'message-queue/schema'    : __dirname + '/src/schema'
    }
  }
}
