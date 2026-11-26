import { Redirect } from 'expo-router';

// /games/all (Round 88): Round 87 put the games shelf here, behind
// the Arcade hub's Games card. The hub has moved to the dashboard
// (Digital Workbooks) and the shelf is back at the Arcade root, so
// this route simply redirects there — no link to /games/all breaks.
export default function GamesAllRedirect() {
  return <Redirect href="/games" />;
}
