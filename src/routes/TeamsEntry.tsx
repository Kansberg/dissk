import { useEffect, useState } from "react";
import { app } from "@microsoft/teams-js";

const DISSK_URL = "https://dissk.kansbergconsulting.dk";

export default function TeamsEntry() {
  const [isTeams, setIsTeams] = useState(false);

  useEffect(() => {
    let active = true;
    app.initialize()
      .then(() => active && setIsTeams(true))
      .catch(() => active && setIsTeams(false));
    return () => {
      active = false;
    };
  }, []);

  const openDissk = () => {
    if (isTeams && app.isInitialized()) {
      void app.openLink(DISSK_URL).catch(() => {
        window.open(DISSK_URL, "_blank", "noopener,noreferrer");
      });
      return;
    }

    window.open(DISSK_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <main style={styles.page}>
      <button type="button" onClick={openDissk} style={styles.button}>
        Åbn din personlige DISSK
      </button>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 24,
    background: "#ffffff",
  },
  button: {
    minHeight: 56,
    padding: "14px 26px",
    border: 0,
    borderRadius: 12,
    background: "#03424f",
    color: "#ffffff",
    font: "inherit",
    fontSize: 17,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 6px 18px rgba(3, 66, 79, 0.22)",
  },
};
