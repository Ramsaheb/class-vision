name: ✨ Feature Request
description: Propose a new feature or improvement for Class Vision
labels: ["enhancement", "feature-request"]
body:
  - type: markdown
    attributes:
      value: |
        We are always looking to improve Class Vision! Suggest a new feature or improvement below.

  - type: textarea
    id: proposal
    attributes:
      label: Is your feature request related to a problem?
      description: A clear and concise description of what the problem is.
      placeholder: E.g., It's hard to track attendance when multiple classrooms are running...

  - type: textarea
    id: solution
    attributes:
      label: Describe the proposed solution
      description: A clear and concise description of what you want to happen or be added.
      placeholder: Add multi-classroom routing to the backend and a classroom dropdown to the React dashboard.
    validations:
      required: true

  - type: textarea
    id: alternatives
    attributes:
      label: Describe alternatives you've considered
      description: A clear and concise description of any alternative solutions or features you've considered.
      placeholder: Doing it manually or through separate ports.

  - type: textarea
    id: additional-context
    attributes:
      label: Additional context or mockups
      description: Add any other context, screenshots, or design wireframes here.
      placeholder: Attach mockups or additional documents.
    validations:
      required: false
