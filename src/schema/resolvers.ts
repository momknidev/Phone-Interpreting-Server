import merge from "lodash.merge";
import user from "./client/resolvers";
import mediatorGroup from "./mediatorGroup/resolvers";
import interpreter from "./interpreter/resolvers";
import language from "./language/resolvers";
import ClientCode from "./clientCode/resolvers";
import CallReports from "./callReports/resolvers";
import CallRouting from './call_routing/resolvers'


const resolvers = merge(
  user,
  mediatorGroup,
  interpreter,
  language,
  ClientCode,
  CallReports,
  CallRouting
);
export default resolvers;
