import merge from "lodash.merge";
// INTRANET
import user from "./user/resolvers";


const resolvers = merge(
  user
);
export default resolvers;
