"""
Redis and Celery Configuration
"""
import os
from datetime import timedelta

# Redis Configuration
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6380))  # Changed from 6379
REDIS_DB = int(os.getenv("REDIS_DB", 0))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)

# Redis URL for connections
REDIS_URL = f"redis://:{REDIS_PASSWORD}@{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}" if REDIS_PASSWORD else f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}"

# Celery Configuration
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL

# Cache Configuration
CACHE_DEFAULT_TIMEOUT = 300  # 5 minutes
CACHE_EVENT_TIMEOUT = 600  # 10 minutes
CACHE_STATS_TIMEOUT = 1800  # 30 minutes
CACHE_BUS_TIMEOUT = 120  # 2 minutes
CACHE_TICKET_TIMEOUT = 300  # 5 minutes

# Event processing config
EVENT_PROCESSING_QUEUE = "event_processing"
NOTIFICATION_QUEUE = "notifications"
ANALYTICS_QUEUE = "analytics"

# Celery Beat Schedule
CELERY_BEAT_SCHEDULE = {
    'sync-stats-every-minute': {
        'task': 'tasks.celery_tasks.update_stats_cache',
        'schedule': timedelta(minutes=1),
    },
    'sync-impact-every-5-minutes': {
        'task': 'tasks.celery_tasks.update_impact_cache',
        'schedule': timedelta(minutes=5),
    },
    'sync-road-health-every-10-minutes': {
        'task': 'tasks.celery_tasks.update_road_health_cache',
        'schedule': timedelta(minutes=10),
    },
    'cleanup-old-cache-every-hour': {
        'task': 'tasks.celery_tasks.cleanup_cache',
        'schedule': timedelta(hours=1),
    },
}