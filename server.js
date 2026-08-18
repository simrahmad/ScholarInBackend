require("dotenv").config();
const { createApp } = require("./src/app");

const app = createApp();
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Scholario backend listening on port ${port} (${process.env.NODE_ENV || "development"})`);
});
