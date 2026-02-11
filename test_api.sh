#!/bin/bash
curl -X POST http://localhost:3000/api/review \
  -H "Content-Type: application/json" \
  -d '{
    "portfolioUrl": "https://example.com",
    "ruthlessness": 5
  }'
