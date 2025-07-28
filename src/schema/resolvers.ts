import merge from "lodash.merge";
import user from "./client/resolvers";
import mediatorGroup from "./mediatorGroup/resolvers";
import mediator from "./mediator/resolvers";
import language from "./language/resolvers";
import ClientCode from "./clientCode/resolvers";
import PhoneMediation from "./phoneMediation/resolvers";


const resolvers = merge(
  user,
  mediatorGroup,
  mediator,
  language,
  ClientCode,
  PhoneMediation
);
export default resolvers;
