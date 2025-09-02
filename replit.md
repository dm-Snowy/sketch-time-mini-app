# Overview

Sketch-Time is a Telegram bot application designed to help users build and maintain daily sketching habits. The system combines a Telegram bot interface with a web-based Mini-App that provides habit tracking, timer functionality, and progress visualization. Users can upload daily sketches through the bot and use the integrated timer to focus on their art practice while tracking streaks and viewing progress statistics.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Backend Architecture
The application uses a Node.js backend built with Express.js that serves both as a web server for the Mini-App and handles Telegram bot interactions through the Telegraf library. The server provides RESTful API endpoints for user statistics and session management while processing incoming bot commands and photo uploads.

## Frontend Architecture
The frontend is a vanilla JavaScript Single Page Application (SPA) designed specifically as a Telegram Mini-App. It integrates with Telegram's WebApp API to access user information and provides an interactive interface with timer functionality, streak visualization, and progress charts using Chart.js.

## Data Storage
The system uses SQLite as the primary database solution with a simple schema consisting of two main tables:
- **uploads**: Tracks user sketch submissions with user ID, file ID, and upload dates
- **sessions**: Records completed sketching sessions to calculate streaks and track progress

Database indexes are implemented on user_id and date fields to optimize query performance for streak calculations and user statistics.

## Bot Integration
The Telegram bot handles multiple interaction patterns:
- **Command Processing**: Responds to /start commands with welcome messages and Mini-App launch buttons
- **Media Handling**: Processes uploaded photos (sketches) and stores metadata in the database
- **Session Management**: Tracks when users complete sketching sessions for streak calculation

## Timer System
The frontend implements a customizable Pomodoro-style timer with preset durations (15, 25, 45 minutes) to help users focus during sketching sessions. Timer state is managed entirely client-side with visual feedback and integration with the session completion workflow.

# External Dependencies

## Core Technologies
- **Telegraf**: Telegram Bot API framework for handling bot interactions and webhook processing
- **Express.js**: Web server framework providing API endpoints and static file serving
- **SQLite3**: Embedded database for local data persistence without external database requirements

## Frontend Libraries
- **Chart.js**: Data visualization library for rendering progress charts and statistics
- **Telegram WebApp API**: Official Telegram integration for Mini-App functionality and user authentication

## Environment Configuration
The application requires minimal external configuration:
- **BOT_TOKEN**: Telegram bot authentication token from BotFather
- **APP_URL**: Base URL for the web application to enable Mini-App integration

The system is designed to be self-contained with no external API dependencies beyond Telegram's services, making it suitable for simple deployment scenarios.