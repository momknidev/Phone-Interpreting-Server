import user from "./client/typeDefs";
import mediatorGroup from './mediatorGroup/typeDefs'
import interpreter from './interpreter/typeDefs'
import language from './language/typeDefs'
import ClientCode from './clientCode/typeDefs'
import CallReports from './callReports/typeDefs'
import CallRouting from './call_routing/typeDefs'


const typeDefs = [
  user,
  mediatorGroup,
  interpreter,
  language,
  ClientCode,
  CallReports,
  CallRouting
];
export default typeDefs;
