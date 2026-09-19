# api-contracts

Shared API types generated from the FastAPI OpenAPI schema so web and mobile
stay in sync with the backend.

## Regenerate TypeScript types

With the API running locally:

```bash
npx openapi-typescript http://localhost:8000/openapi.json -o packages/api-contracts/src/schema.d.ts
```

Flutter (Dart) generation will use `openapi-generator` once `apps/mobile` exists.

Rule: never hand-edit generated files; change the Pydantic schemas in
`apps/api/app/modules/*/schemas.py` and regenerate.
