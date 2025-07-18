import merge from "lodash.merge";
// INTRANET
import user from "./user/resolvers";
import mediatorGroup from "./mediatorGroup/resolvers";
import mediator from "./mediator/resolvers";
import language from "./language/resolvers";
import userCode from "./userCode/resolvers";


const resolvers = merge(
  user,
  mediatorGroup,
  mediator,
  language,
  userCode
);
export default resolvers;
