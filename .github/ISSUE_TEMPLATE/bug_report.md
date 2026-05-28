name: 🐛 Bug Report
description: Report a bug to help us improve Class Vision
labels: ["bug", "triage"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for taking the time to file a bug report! Please fill out the sections below as completely as possible.
  
  - type: textarea
    id: describe-bug
    attributes:
      label: Describe the Bug
      description: A clear and concise description of what the bug is.
      placeholder: E.g., The face recognition fails with an Out of Memory error when processing 4K videos...
    validations:
      required: true

  - type: textarea
    id: reproduction-steps
    attributes:
      label: Steps to Reproduce
      description: How can we reproduce this behavior? Please list the exact steps.
      placeholder: |
        1. Put video in project/Input/
        2. Set PROCESS_EVERY_N_FRAMES=1 in .env
        3. Run python server.py
        4. See error in terminal
    validations:
      required: true

  - type: textarea
    id: expected-behavior
    attributes:
      label: Expected Behavior
      description: A clear and concise description of what you expected to happen.
      placeholder: The video processes successfully and saves a CSV log in the Output folder.
    validations:
      required: true

  - type: textarea
    id: environment
    attributes:
      label: Environment Info
      description: OS version, Python version, PyTorch version, GPU model, etc.
      placeholder: |
        - OS: Windows 11
        - Python: 3.10.12
        - PyTorch: 2.1.0 (CUDA 11.8)
        - GPU: NVIDIA RTX 3060
        - Browser (Dashboard): Chrome 122
    validations:
      required: true

  - type: textarea
    id: logs
    attributes:
      label: Logs or Stack Trace
      description: Please paste any relevant console logs or stack traces here.
      placeholder: |
        Traceback (most recent call last):
          ...
          RuntimeError: CUDA out of memory.
    validations:
      required: false
