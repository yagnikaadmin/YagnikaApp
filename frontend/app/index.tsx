import React from 'react';
import { Redirect } from 'expo-router';

// NOTE: For this build the app is scoped to the Yagnika (priest)
// registration flow only. The Yajmana (devotee) and Admin experiences
// still exist in the codebase (app/home.tsx, app/register.tsx,
// app/login.tsx, app/admin-dashboard.tsx, app/(devotee)/*, etc.) but are
// intentionally not routed to. To restore the full launcher, change this
// back to the original splash screen that routes to "/home".
export default function Index() {
  return <Redirect href="/priest-register" />;
}
