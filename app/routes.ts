import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    index("routes/starter.tsx"), // home page
    route("profile", "routes/profile.tsx"), // /profile page
] satisfies RouteConfig;
