/**
 * @memberof MessageQueue.Schema.Output
 * @typedef {Object} Message
 */
const schema =
{
  '@meta': 
  {
    'extends'   : 'message-queue/schema/entity/message'
  },
  'id':
  {
    'type'      : 'string',
    'not-empty' : true
  }
}

module.exports = schema
