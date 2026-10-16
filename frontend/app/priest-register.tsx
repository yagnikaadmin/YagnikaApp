import React from 'react';
import PriestProfileForm from '@/src/components/PriestProfileForm';

// Yagnika (Priest) Registration. The form is shared with the priest's Edit
// Profile screen (app/priest-profile-edit.tsx) so both offer the same fields.
export default function PriestRegister() {
  return <PriestProfileForm mode="register" />;
}
