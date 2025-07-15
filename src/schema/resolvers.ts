import merge from "lodash.merge";
// INTRANET
import user from "./user/resolvers";
import mediatorGroup from "./mediatorGroup/resolvers";
import mediator from "./mediator/resolvers";


const resolvers = merge(
  user,
  mediatorGroup,
  mediator
);
export default resolvers;
