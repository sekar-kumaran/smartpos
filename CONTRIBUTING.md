# Contributing

Thanks for contributing to SmartPOS AI Community Edition.

## Ground Rules

- Do not add production secrets or private endpoints.
- Keep changes scoped to the Community Edition only.
- Follow the existing code style and naming conventions.

## Development Workflow

1. Fork the repository and create a feature branch
2. Make your changes with clear commit messages
3. Run tests relevant to your changes
4. Open a PR with a concise description and screenshots (if UI changes)

## Tests

Backend:

```bash
cd backend
pytest tests/ -q
```

Frontend:

```bash
cd frontend
npm test
```

## Linting

- Backend: `ruff check app/`
- Frontend: `npm run lint`

## Security

If you find a vulnerability, see SECURITY.md for the reporting process.
