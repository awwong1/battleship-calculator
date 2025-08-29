# Battleship Probability Calculator

[Demo](https://battleship-calculator.udia.workers.dev/)

This project is a tool to help you win at Battleship. It calculates the probability of a ship being in any given cell on the board, based on the current state of the game. This is visualized as a heatmap, allowing you to make more informed decisions about where to fire your next shot.

## How it works

The calculator uses a Monte Carlo method to determine the probabilities. A web worker runs in the background, generating thousands of valid random ship placements that are consistent with the known information about the board (hits, misses, and sunk ships). The probabilities are then calculated by counting how many times a ship is placed in each cell across all valid simulations.

## Features

-   **Interactive Grid**: Click on cells to cycle through states (Unknown, Miss, Hit, Sunk).
-   **Customizable Board Size**: Adjust the number of rows and columns.
-   **Manage Ships**: Add, remove, and update the dimensions of the ships remaining in play. Mark ships as sunk.
-   **Real-time Heatmap**: The board updates with a color-coded heatmap representing the probability distribution of ship locations.
-   **Top 10 Cells**: A list of the 10 most likely cells to contain a ship is displayed.
-   **Web Worker for Performance**: The heavy computations are offloaded to a separate thread to keep the UI responsive.

## Getting Started

To run this project locally, you'll need [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/) installed.

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/awwong1/battleship-calculator.git
    cd battleship-calculator
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the development server:**
    ```bash
    npm run dev
    ```

    This will start a local development server. You can view the application in your browser at the address provided in the terminal (usually `http://localhost:5173`).

## Deployment

This project is configured for deployment to [Cloudflare Workers](https://workers.cloudflare.com/).

To deploy the application, you'll need a Cloudflare account and the [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/get-started/) installed and configured.

Once set up, you can deploy with the following command:

```bash
npm run deploy
