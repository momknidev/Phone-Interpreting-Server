import merge from "lodash.merge";
// INTRANET
import user from "./user/resolvers";
import mediatorGroup from "./mediator_group/resolvers";


const resolvers = merge(
  user,
  mediatorGroup
);
export default resolvers;
