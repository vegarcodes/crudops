import fs from "fs";
import jsonServer from "json-server";
import dotenv from "dotenv";
import packageJson from "./package.json" with {type: "json"};

dotenv.config({ quiet: true });

console.log(`Crudops versjon ${packageJson.version}\n\n`);

/* Sjekker om miljøvariablene i .env er spesifisert */
if (!process.env.TEMPLATE) {
  console.error("Fatal feil: du må spesifisere en template som skal brukes som en miljøvariabel kalt TEMPLATE. Les dokumentasjonen for mer info.");
  process.exit(1);
}

if (!process.env.API_KEY) {
  console.error("Fatal feil: du må spesifisere en API-nøkkel som skal brukes som en miljøvariabel kalt API_KEY. Les dokumentasjonen for mer info.");
  process.exit(1);
}

/* Sjekker om TEMPLATE er korrekt */
if (!fs.existsSync(`./templates/${process.env.TEMPLATE}`)) {
  console.error(`Fatal feil: Den angitte templaten (${process.env.TEMPLATE}) ligger ikke i templates-mappa. Pass på at du bare skriver filnavnet som skal brukes, for eksempel "testdata.json".`);
  process.exit(1);
}

/* Dersom databasefilen ikke eksisterer, kopier templaten til db.json */
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

/* Endepunkt: Bytt ut :code med ønsket HTTP-statuskode, og APIet sender en respons tilbake med den statuskoden. Nyttig for testing av 404, 500 og så videre. */
server.all("/api/status/:code", (request, response) => {
  const code = Number(request.params.code);
  
  if (code !== NaN && typeof code === "number" && code >= 200 && code <= 599) {
    response
    .status(Number(code))
    .json({
      statusCode: code,
      message: `Hei! Du har bedt om statuskode ${code}`,
      headers: request.headers,
      body: request.body
    });
  } else {
    response
    .status(400)
    .json({
      message: "Du har angitt en ugyldig statuskode. Pass på at statuskoden er mellom 200 og 599."
    });
  }
});

/* Endepunkt: Send respons etter spesifisert antall millisekunder. */
server.all("/api/delay/:ms", (request, response) => {
  const ms = Number(request.params.ms);

  if (ms !== NaN && typeof ms === "number" && ms > 0) {
    setTimeout(() => {
      response
        .status(200)
        .json({
          message: `Respons sendt etter ${Math.ceil(ms)} millisekunder.`,
          headers: request.headers,
          body: request.body
        });
    }, Math.ceil(ms));
  } else {
    response
    .status(400)
    .json({
      message: "Du har angitt et ugyldig antall millisekunder. Pass på at du angir et heltall over 0."
    });
  }
});


server.use("/api", router);

server.listen(3000, () => {
  console.log(`Starter APIet.\n\nPort: 3000\nTemplate: ${process.env.TEMPLATE}\nAPI-nøkkel: ${process.env.API_KEY}.`);
});
