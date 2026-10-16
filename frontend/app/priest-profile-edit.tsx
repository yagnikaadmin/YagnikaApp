import React from 'react';
import PriestProfileForm from '@/src/components/PriestProfileForm';

// Priest Edit Profile: the registration form in edit mode, so the priest can
// change exactly the details given at registration — no more, no fewer.
export default function PriestProfileEdit() {
  return <PriestProfileForm mode="edit" />;
}
