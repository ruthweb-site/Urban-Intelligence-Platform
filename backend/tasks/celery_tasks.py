"""
Celery Tasks for Async Processing
Event processing, notifications, analytics
"""
import logging
from celery import Celery
from celery.signals import task_prerun, task_postrun
from datetime import datetime, timezone
from config import (
    CELERY_BROKER_URL, CELERY_RESULT_BACKEND,
    CELERY_BEAT_SCHEDULE
)
from database.db import (
    get_stats, get_impact, get_road_health, get_buses, get_heatmap_points
)
from database.redis_cache import (
    redis_cache, cache_stats, cache_impact, cache_road_health,
    cache_buses, cache_heatmap, invalidate_events_cache
)

logger = logging.getLogger(__name__)

# ============================================================================
# Initialize Celery
# ============================================================================

celery_app = Celery(__name__)

celery_app.conf.update(
    broker_url=CELERY_BROKER_URL,
    result_backend=CELERY_RESULT_BACKEND,
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,  # 30 minutes hard limit
    task_soft_time_limit=25 * 60,  # 25 minutes soft limit
    beat_schedule=CELERY_BEAT_SCHEDULE,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=100,
)


# ============================================================================
# Task Signals
# ============================================================================

@task_prerun.connect
def task_prerun_handler(sender=None, task_id=None, task=None, args=None, **kwargs):
    """Handle task start"""
    logger.info(f"[Task] Starting: {task.name} (ID: {task_id})")


@task_postrun.connect
def task_postrun_handler(sender=None, task_id=None, task=None, result=None, **kwargs):
    """Handle task completion"""
    logger.info(f"[Task] Completed: {task.name} (ID: {task_id})")


# ============================================================================
# Event Processing Tasks
# ============================================================================

@celery_app.task(name='tasks.celery_tasks.process_event', bind=True, retry_kwargs={'max_retries': 3})
def process_event(self, event_id: int, event_data: dict):
    """
    Process incoming event from edge device
    Triggered when new event is created
    """
    try:
        logger.info(f"[Event Task] Processing event {event_id}: {event_data.get('event_type')}")
        
        # Invalidate events cache when new event arrives
        invalidate_events_cache()
        
        # You can add more processing here:
        # - ML model predictions
        # - Anomaly detection
        # - Send notifications
        
        return {"status": "processed", "event_id": event_id}
    except Exception as exc:
        logger.error(f"[Event Task] Error processing event {event_id}: {exc}")
        # Retry with exponential backoff
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)


@celery_app.task(name='tasks.celery_tasks.batch_process_events', retry_kwargs={'max_retries': 3})
def batch_process_events(event_ids: list):
    """Process multiple events in batch"""
    try:
        logger.info(f"[Batch Task] Processing {len(event_ids)} events")
        
        for event_id in event_ids:
            process_event.delay(event_id, {})
        
        return {"status": "batch_queued", "count": len(event_ids)}
    except Exception as exc:
        logger.error(f"[Batch Task] Error: {exc}")
        raise


# ============================================================================
# Ticket Processing Tasks
# ============================================================================

@celery_app.task(name='tasks.celery_tasks.create_ticket_async', bind=True, retry_kwargs={'max_retries': 3})
def create_ticket_async(self, ticket_data: dict):
    """
    Async ticket creation
    Triggered after event processing
    """
    try:
        logger.info(f"[Ticket Task] Creating ticket for event {ticket_data.get('event_id')}")
        
        # Cache invalidation
        from database.redis_cache import invalidate_tickets_cache
        invalidate_tickets_cache()
        
        return {"status": "ticket_created", "ticket_id": ticket_data.get("ticket_id")}
    except Exception as exc:
        logger.error(f"[Ticket Task] Error: {exc}")
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)


@celery_app.task(name='tasks.celery_tasks.send_ticket_notification')
def send_ticket_notification(ticket_id: str, notification_type: str, recipient: str):
    """Send ticket notification"""
    try:
        logger.info(f"[Notification] Sending {notification_type} for ticket {ticket_id} to {recipient}")
        
        # Add your notification logic here
        # - Email
        # - SMS
        # - Push notification
        
        return {"status": "notification_sent", "ticket_id": ticket_id}
    except Exception as exc:
        logger.error(f"[Notification] Error: {exc}")
        raise


# ============================================================================
# Analytics & Caching Tasks
# ============================================================================

@celery_app.task(name='tasks.celery_tasks.update_stats_cache')
def update_stats_cache():
    """Update stats cache every minute"""
    try:
        logger.info("[Cache Task] Updating stats cache")
        
        stats = get_stats()
        cache_stats(stats)
        
        return {"status": "stats_cached", "timestamp": datetime.now(timezone.utc).isoformat()}
    except Exception as exc:
        logger.error(f"[Cache Task] Error updating stats: {exc}")
        return {"status": "error", "message": str(exc)}


@celery_app.task(name='tasks.celery_tasks.update_impact_cache')
def update_impact_cache():
    """Update impact metrics cache every 5 minutes"""
    try:
        logger.info("[Cache Task] Updating impact cache")
        
        impact = get_impact()
        cache_impact(impact)
        
        return {"status": "impact_cached", "timestamp": datetime.now(timezone.utc).isoformat()}
    except Exception as exc:
        logger.error(f"[Cache Task] Error updating impact: {exc}")
        return {"status": "error", "message": str(exc)}


@celery_app.task(name='tasks.celery_tasks.update_road_health_cache')
def update_road_health_cache():
    """Update road health cache every 10 minutes"""
    try:
        logger.info("[Cache Task] Updating road health cache")
        
        health = get_road_health()
        cache_road_health(health)
        
        return {"status": "health_cached", "timestamp": datetime.now(timezone.utc).isoformat()}
    except Exception as exc:
        logger.error(f"[Cache Task] Error updating health: {exc}")
        return {"status": "error", "message": str(exc)}


@celery_app.task(name='tasks.celery_tasks.update_buses_cache')
def update_buses_cache():
    """Update buses cache every 2 minutes"""
    try:
        logger.info("[Cache Task] Updating buses cache")
        
        buses = get_buses()
        cache_buses(buses)
        
        return {"status": "buses_cached", "count": len(buses)}
    except Exception as exc:
        logger.error(f"[Cache Task] Error updating buses: {exc}")
        return {"status": "error", "message": str(exc)}


@celery_app.task(name='tasks.celery_tasks.update_heatmap_cache')
def update_heatmap_cache():
    """Update heatmap cache every 5 minutes"""
    try:
        logger.info("[Cache Task] Updating heatmap cache")
        
        points = get_heatmap_points()
        cache_heatmap(points)
        
        return {"status": "heatmap_cached", "points": len(points)}
    except Exception as exc:
        logger.error(f"[Cache Task] Error updating heatmap: {exc}")
        return {"status": "error", "message": str(exc)}


@celery_app.task(name='tasks.celery_tasks.cleanup_cache')
def cleanup_cache():
    """Cleanup old cache entries every hour"""
    try:
        logger.info("[Cache Task] Running cache cleanup")
        
        # Clear patterns older than certain time
        redis_cache.clear_pattern("event:*_old")
        redis_cache.clear_pattern("ticket:*_old")
        
        return {"status": "cleanup_completed", "timestamp": datetime.now(timezone.utc).isoformat()}
    except Exception as exc:
        logger.error(f"[Cache Task] Cleanup error: {exc}")
        return {"status": "error", "message": str(exc)}


# ============================================================================
# Monitoring Tasks
# ============================================================================

@celery_app.task(name='tasks.celery_tasks.check_redis_health')
def check_redis_health():
    """Monitor Redis health"""
    try:
        if redis_cache.is_connected():
            stats = redis_cache.get_stats()
            logger.info(f"[Health Check] Redis OK - {stats}")
            return {"status": "healthy", "redis": stats}
        else:
            logger.warning("[Health Check] Redis disconnected")
            return {"status": "unhealthy", "message": "Redis disconnected"}
    except Exception as exc:
        logger.error(f"[Health Check] Error: {exc}")
        return {"status": "error", "message": str(exc)}


# ============================================================================
# Utility Tasks
# ============================================================================

@celery_app.task(name='tasks.celery_tasks.export_events_report')
def export_events_report(start_date: str, end_date: str, event_type: str = None):
    """Generate events report"""
    try:
        logger.info(f"[Report] Generating events report from {start_date} to {end_date}")
        
        # Add your report generation logic here
        
        return {
            "status": "report_generated",
            "start_date": start_date,
            "end_date": end_date,
            "event_type": event_type
        }
    except Exception as exc:
        logger.error(f"[Report] Error: {exc}")
        return {"status": "error", "message": str(exc)}


@celery_app.task(name='tasks.celery_tasks.send_daily_digest')
def send_daily_digest(recipient_email: str):
    """Send daily digest email"""
    try:
        logger.info(f"[Digest] Sending daily digest to {recipient_email}")
        
        # Get cached stats
        stats = cache_stats.get()
        impact = cache_impact.get()
        
        # Send email with stats
        
        return {"status": "digest_sent", "recipient": recipient_email}
    except Exception as exc:
        logger.error(f"[Digest] Error: {exc}")
        return {"status": "error", "message": str(exc)}