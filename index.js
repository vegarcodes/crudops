import fs from "fs";
import jsonServer from "json-server";
import dotenv from "dotenv";
import packageJson from "./package.json" with {type: "json"};

dotenv.config({ quiet: true });

console.log(`Crudops versjon ${packageJson.version}\n\n`);

if (!process.env.TEMPLATE) {
  console.error("Fatal feil: du må spesifisere en template som skal brukes som en miljøvariabel kalt TEMPLATE. Les dokumentasjonen for mer info.");
  process.exit(1);
}

if (!process.env.API_KEY) {
  console.error("Fatal feil: du må spesifisere en API-nøkkel som skal brukes som en miljøvariabel kalt API_KEY. Les dokumentasjonen for mer info.");
  process.exit(1);
}

if (!fs.existsSync(`./templates/${process.env.TEMPLATE}`)) {
  console.error(`Fatal feil: Den angitte templaten (${process.env.TEMPLATE}) ligger ikke i templates-mappa. Pass på at du bare skriver filnavnet som skal brukes, for eksempel "testdata.json".`);
  process.exit(1);
}

if (!fs.existsSync("./db.json")) {
  console.log(`Databasefilen finnes ikke — kopierer fra angitt template.\n\n`);
  fs.copyFileSync(`./templates/${process.env.TEMPLATE}`, "./db.json");
} 

const server = jsonServer.create();
const router = jsonServer.router("db.json");
const middlewares = jsonServer.defaults();

server.use(middlewares);
server.use(jsonServer.bodyParser);

/* Autorisering: dersom method er noe annet enn GET må API-nøkkel være sendt med i header. */
server.use((request, response, next) => {
  if (request.method === "GET") {
    next();
  } else {
    if (request.headers["authorization"] === `Bearer ${process.env.API_KEY}`) {
      next();
    } else {
      response.status(401).json({message: "Unauthorized - har du glemt API-nøkkel?"});
    }
  }
});

/* Middleware: dersom det er en POST-request, sett created og updated i objektet som lagres. */
server.use((request, response, next) => {
  if (request.method === "POST") {
    const timestamp = new Date().toISOString();
    request.body.created = timestamp;
    request.body.updated = timestamp;
  }
  next();
});

/* Middleware: dersom det er en PUT- eller PATCH-request, sett updated i objektet som lagres. */
server.use((request, response, next) => {
  if (request.method === "PUT" || request.method === "PATCH" ) {
    request.body.updated = new Date().toISOString();
  }
  next();
});

/* Endepunkt: Dersom /reset kalles, skal databasen tilbakestilles. Overskriver innholdet i databasen med innholdet som ligger i template. */
server.post("/api/reset", (request, response) => {
  console.log("Reset av databasen forespurt — gjenoppretter fra template.");
  const resetData = JSON.parse(fs.readFileSync(`./templates/${process.env.TEMPLATE}`));
  router.db.setState(resetData);
  response.status(200).send();
});

server.use("/api", router);

server.listen(3000, () => {
  console.log(`Starter APIet.\n\nPort: 3000\nTemplate: ${process.env.TEMPLATE}\nAPI-nøkkel: ${process.env.API_KEY}.`);
});
