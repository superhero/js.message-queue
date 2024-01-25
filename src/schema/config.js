/**
 * @namespace MessageQueue.Schema
 */
module.exports =
{
  core:
  {
    schema:
    {
      composer:
      {
        'message-queue/schema/entity/*'  : __dirname + '/entity/*',
        'message-queue/schema/input/*'   : __dirname + '/input/*',
        'message-queue/schema/output/*'  : __dirname + '/output/*'
      }
    }
  }
}
