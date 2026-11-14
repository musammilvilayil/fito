import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: [".next/**", "node_modules/**", "playwright-report/**", "test-results/**", "db/migrations/meta/**"] },
];

export default config;
