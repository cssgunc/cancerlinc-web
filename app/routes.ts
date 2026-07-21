import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    //protected routes
    route("", "routes/require_auth.tsx", [
        // pages that share the top bar in app_layout
        route("", "routes/app_layout.tsx", [
            index("routes/_index.tsx"),
            route("member/:user", "routes/member.tsx"),
            route("staff", "routes/staff_admin.tsx"),
            route("unverified", "routes/unverified.tsx"),
            route("calendar", "routes/calendar.tsx"),
        ]),
        // pages that render their own chrome
        route("profile", "routes/profile.tsx"),
        route("admin/users/:userId", "routes/admin_user.tsx"),
    ]),

    //routes require user to not be logged in
    route("", "routes/require_guest.tsx", [route("login", "routes/login.tsx")]),

    //routes available to anyone
    route("forgot-pass", "routes/forgot_pass.tsx"),
    route("verify-email", "routes/verify_email.tsx"),
] satisfies RouteConfig;
