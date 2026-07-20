<p align="center">
  <img src="./public/cssglogo.svg" alt="CSSG Logo" width="200">
</p>

# CSSG Starter Template

This is a starter template for CSSG projects using React, TypeScript, and Tailwind CSS. It is configured to be used with VS Code Dev Containers for a consistent development environment.

## Prerequisites

Before you begin, ensure you have the following installed:

- [Git](https://git-scm.com/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop)
- [Visual Studio Code](https://code.visualstudio.com/)
- [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) for VS Code.

## Getting Started

1.  **Fork the repository:**

    Fork this repository. Then, clone your forked repository:

    ```bash
    git clone <your-forked-repository-url>
    cd <repository-name>
    ```

2.  **Open in VS Code/Cursor:**

    Open the cloned repository folder in VS Code or Cursor.

3.  **Open in Dev Container:**

    Once the project is open in VS Code, you will be prompted to "Reopen in Container". Click on it.

    If you don't see the prompt, you can open the command palette and run "Dev Containers: Reopen in Container".
    - **Windows/Linux:** `Ctrl+Shift+P`
    - **Mac:** `Cmd+Shift+P`

    This will build the Docker container for the development environment. The first build might take a few minutes. Subsequent loads will be much faster.

## Available Commands

Inside the dev container, you can use the following commands:

| Command             | Description                                                |
| :------------------ | :--------------------------------------------------------- |
| `npm run dev`       | Starts the development server with Hot Module Replacement. |
| `npm run build`     | Builds the application for production.                     |
| `npm run start`     | Serves the production build.                               |
| `npm run lint`      | Lints the codebase using ESLint.                           |
| `npm run lint:fix`  | Lints and automatically fixes issues.                      |
| `npm run format`    | Formats the code using Prettier.                           |
| `npm run typecheck` | Runs the TypeScript compiler to check for type errors.     |

## Feature Notes

- Image messaging rollout and Firebase setup details: [`docs/chat-image-messaging.md`](/workspace/docs/chat-image-messaging.md)
