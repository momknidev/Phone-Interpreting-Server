import merge from "lodash/merge.js";
// INTRANET
import user from "./user/resolvers.js";


const resolvers = merge(
  user
);
export default resolvers;
