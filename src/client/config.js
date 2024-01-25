/**
 * @namespace MessageQueue
 */
module.exports =
{
  core:
  {
    bootstrap:
    {
      'message-queue/client'  : 'message-queue/client'
    },
    dependency:
    {
      'message-queue/channel' : __dirname + '/../channel',
      'message-queue/schema'  : __dirname + '/../schema'
    },
    locator:
    {
      'message-queue/client'  : __dirname
    }
  },
  client:
  {
    'message-queue':
    {
      redis:
      {
        auth    : undefined, // write over these values with the appropriate values
        gateway :
        {
          url: `redis://127.0.0.1:6379` // write over these values with the appropriate values
        },
        cluster :
        [
          // { url: 'redis://10.0.0.1:6379' },
          // { url: 'redis://10.0.0.2:6379' }
        ]
      },
      domain  : '-', // write over these values with the appropriate values
      name    : '*', // write over these values with the appropriate values
    }
  }
}
