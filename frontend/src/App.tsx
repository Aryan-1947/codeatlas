import DiagramPage from "./components/DiagramPage";
import Header from "./components/Header";
import Landing from "./components/Landing";
import { useRoute } from "./lib/store";

export default function App() {
  const route = useRoute();

  return (
    <div className="min-h-screen bg-paper text-ink">
    <Header />
    {route.kind === "home" ? (
      <Landing />
    ) : (
      <DiagramPage key={`${route.ref.owner}/${route.ref.repo}`} repoRef={route.ref} />
    )}
  </div>
  );
}
