import merge from "lodash.merge";
import user from "./client/resolvers";
import mediatorGroup from "./mediatorGroup/resolvers";
import interpreter from "./interpreter/resolvers";
import language from "./language/resolvers";
import ClientCode from "./clientCode/resolvers";
import CallReports from "./callReports/resolvers";


const resolvers = merge(
  user,
  mediatorGroup,
  interpreter,
  language,
  ClientCode,
  CallReports
);
export default resolvers;
