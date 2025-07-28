import user from "./client/typeDefs";
import mediatorGroup from './mediatorGroup/typeDefs'
import mediator from './mediator/typeDefs'
import language from './language/typeDefs'
import ClientCode from './clientCode/typeDefs'
import PhoneMediation from './phoneMediation/typeDefs'


const typeDefs = [
  user,
  mediatorGroup,
  mediator,
  language,
  ClientCode,
  PhoneMediation
];
export default typeDefs;
