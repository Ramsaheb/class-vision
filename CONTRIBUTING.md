# Contributing to Class Vision

Thank you for your interest in contributing! This guide will help you get started.

---

## How to Contribute

### Reporting Bugs

1. Check the [existing issues](https://github.com/Ramsaheb/class-vision/issues) to avoid duplicates.
2. Open a new issue using the **Bug Report** template.
3. Include steps to reproduce, expected behavior, and screenshots if applicable.

### Suggesting Features

1. Open a new issue using the **Feature Request** template.
2. Describe the feature, its use case, and any alternatives you've considered.

### Submitting Code

1. **Fork** the repository.
2. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** and commit with clear messages:
   ```bash
   git commit -m "feat: add student export as PDF"
   ```
4. **Push** your branch:
   ```bash
   git push origin feature/your-feature-name
   ```
5. **Open a Pull Request** against `main`.

---

## Development Setup

### Backend

```bash
cd project/backend
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```

### Frontend

```bash
cd project/frontend
npm install
npm run dev
```

---

## Code Style

### Python (Backend)
- Follow [PEP 8](https://peps.python.org/pep-0008/)
- Use type hints for function signatures
- Add docstrings to public functions and classes

### TypeScript (Frontend)
- Use TypeScript strict mode
- Use functional components with hooks
- Follow the existing component structure in `src/pages/` and `src/components/`

---

## Commit Message Convention

Use conventional commits for clear history:

| Prefix | Usage |
|--------|-------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `style:` | Formatting, no logic change |
| `refactor:` | Code restructure, no feature change |
| `test:` | Adding or updating tests |
| `chore:` | Maintenance, dependencies, CI |

---

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR.
- Update documentation if your change affects usage.
- Ensure the backend starts without errors (`uvicorn server:app`).
- Ensure the frontend builds without errors (`npm run build`).
- Fill out the PR template completely.

---

## Need Help?

Open a [Discussion](https://github.com/Ramsaheb/class-vision/discussions) or reach out in an issue. We're happy to help!
