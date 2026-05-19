const url = "https://iptcmenyayszbftwfhoz.supabase.co/rest/v1/?apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwdGNtZW55YXlzemJmdHdmaG96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0Njg0ODIsImV4cCI6MjA5MzA0NDQ4Mn0.p8KEeYVNqDq6Uk5wO1KEhaXrfssJIdBoAxnFEz6y_Bo";

async function fetchSchema() {
  try {
    const res = await fetch(url);
    const schema = await res.json();
    
    console.log("Tables found:", Object.keys(schema.definitions || {}));
    
    if (schema.definitions && schema.definitions.monitoring_tasks) {
      console.log("monitoring_tasks columns:", Object.keys(schema.definitions.monitoring_tasks.properties));
    } else {
      console.log("monitoring_tasks definition not found in schema");
    }

    if (schema.definitions && schema.definitions.monitoring_projects) {
      console.log("monitoring_projects columns:", Object.keys(schema.definitions.monitoring_projects.properties));
    }
  } catch (err) {
    console.error("Error fetching schema:", err);
  }
}

fetchSchema();
