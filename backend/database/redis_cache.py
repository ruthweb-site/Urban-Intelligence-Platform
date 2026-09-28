"""
Redis Cache Layer for Urban Intelligence Platform
Handles caching of events, tickets, stats, and analytics
"""
import redis
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional, List, Dict
from config import (
    REDIS_HOST, REDIS_PORT, REDIS_DB, REDIS_PASSWORD,
    CACHE_DEFAULT_TIMEOUT, CACHE_EVENT_TIMEOUT, CACHE_STATS_TIMEOUT,
    CACHE_BUS_TIMEOUT, CACHE_TICKET_TIMEOUT
)

logger = logging.getLogger(__name__)

# ============================================================================
# Redis Connection Pool
# ============================================================================

class RedisCache:
    """Redis cache wrapper with connection pooling"""
    
    def __init__(self):
        """Initialize Redis connection pool"""
        try:
            self.pool = redis.ConnectionPool(
                host=REDIS_HOST,
                port=REDIS_PORT,
                db=REDIS_DB,
                password=REDIS_PASSWORD,
                max_connections=10,
                decode_responses=True,
                socket_keepalive=True,
                socket_keepalive_options={
                    1: 1,  # TCP_KEEPIDLE
                    2: 1,  # TCP_KEEPINTVL
                    3: 3,  # TCP_KEEPCNT
                }
            )
            self.redis_client = redis.Redis(connection_pool=self.pool)
            
            # Test connection
            self.redis_client.ping()
            logger.info("[Redis] Connected successfully")
        except redis.ConnectionError as e:
            logger.error(f"[Redis] Connection failed: {e}")
            self.redis_client = None

    def is_connected(self) -> bool:
        """Check if Redis is connected"""
        try:
            if self.redis_client:
                self.redis_client.ping()
                return True
        except Exception:
            pass
        return False

    def set(self, key: str, value: Any, timeout: int = CACHE_DEFAULT_TIMEOUT) -> bool:
        """Set a key-value pair with TTL"""
        try:
            if not self.redis_client:
                return False
            
            if isinstance(value, (dict, list)):
                value = json.dumps(value)
            
            self.redis_client.setex(key, timeout, value)
            logger.debug(f"[Cache] SET {key} (TTL: {timeout}s)")
            return True
        except Exception as e:
            logger.error(f"[Cache] SET error for {key}: {e}")
            return False

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        try:
            if not self.redis_client:
                return None
            
            value = self.redis_client.get(key)
            if value:
                try:
                    return json.loads(value)
                except (json.JSONDecodeError, TypeError):
                    return value
            return None
        except Exception as e:
            logger.error(f"[Cache] GET error for {key}: {e}")
            return None

    def delete(self, key: str) -> bool:
        """Delete a key from cache"""
        try:
            if not self.redis_client:
                return False
            
            self.redis_client.delete(key)
            logger.debug(f"[Cache] DELETE {key}")
            return True
        except Exception as e:
            logger.error(f"[Cache] DELETE error for {key}: {e}")
            return False

    def exists(self, key: str) -> bool:
        """Check if key exists"""
        try:
            if not self.redis_client:
                return False
            return self.redis_client.exists(key) > 0
        except Exception:
            return False

    def increment(self, key: str, amount: int = 1) -> Optional[int]:
        """Increment a counter"""
        try:
            if not self.redis_client:
                return None
            return self.redis_client.incr(key, amount)
        except Exception as e:
            logger.error(f"[Cache] INCREMENT error for {key}: {e}")
            return None

    def append_list(self, key: str, value: Any, timeout: int = CACHE_DEFAULT_TIMEOUT) -> bool:
        """Append to a list"""
        try:
            if not self.redis_client:
                return False
            
            if isinstance(value, (dict, list)):
                value = json.dumps(value)
            
            pipe = self.redis_client.pipeline()
            pipe.rpush(key, value)
            pipe.expire(key, timeout)
            pipe.execute()
            logger.debug(f"[Cache] APPEND {key}")
            return True
        except Exception as e:
            logger.error(f"[Cache] APPEND error for {key}: {e}")
            return False

    def get_list(self, key: str) -> List[Any]:
        """Get all items from list"""
        try:
            if not self.redis_client:
                return []
            
            items = self.redis_client.lrange(key, 0, -1)
            result = []
            for item in items:
                try:
                    result.append(json.loads(item))
                except (json.JSONDecodeError, TypeError):
                    result.append(item)
            return result
        except Exception as e:
            logger.error(f"[Cache] GET_LIST error for {key}: {e}")
            return []

    def clear_pattern(self, pattern: str) -> int:
        """Delete all keys matching pattern"""
        try:
            if not self.redis_client:
                return 0
            
            keys = self.redis_client.keys(pattern)
            if keys:
                return self.redis_client.delete(*keys)
            return 0
        except Exception as e:
            logger.error(f"[Cache] CLEAR_PATTERN error for {pattern}: {e}")
            return 0

    def flush_all(self) -> bool:
        """Clear entire Redis database"""
        try:
            if not self.redis_client:
                return False
            self.redis_client.flushdb()
            logger.warning("[Cache] FLUSH_ALL - Database cleared")
            return True
        except Exception as e:
            logger.error(f"[Cache] FLUSH_ALL error: {e}")
            return False

    def get_stats(self) -> Dict[str, Any]:
        """Get Redis stats"""
        try:
            if not self.redis_client:
                return {"status": "disconnected"}
            
            info = self.redis_client.info()
            return {
                "status": "connected",
                "used_memory": info.get("used_memory_human", "N/A"),
                "connected_clients": info.get("connected_clients", 0),
                "total_commands": info.get("total_commands_processed", 0),
                "uptime_seconds": info.get("uptime_in_seconds", 0),
            }
        except Exception as e:
            logger.error(f"[Cache] GET_STATS error: {e}")
            return {"status": "error", "message": str(e)}

    def close(self):
        """Close connection pool"""
        try:
            if self.pool:
                self.pool.disconnect()
                logger.info("[Redis] Connection closed")
        except Exception as e:
            logger.error(f"[Redis] Error closing connection: {e}")


# ============================================================================
# Global Redis Instance
# ============================================================================

redis_cache = RedisCache()


# ============================================================================
# Cache Key Builders
# ============================================================================

def get_event_key(event_id: int) -> str:
    """Get cache key for event"""
    return f"event:{event_id}"


def get_events_list_key(event_type: Optional[str] = None, bus_id: Optional[str] = None) -> str:
    """Get cache key for events list"""
    key = "events:list"
    if event_type:
        key += f":type:{event_type}"
    if bus_id:
        key += f":bus:{bus_id}"
    return key


def get_stats_key() -> str:
    """Get cache key for stats"""
    return "stats:all"


def get_heatmap_key() -> str:
    """Get cache key for heatmap"""
    return "heatmap:points"


def get_ticket_key(ticket_id: str) -> str:
    """Get cache key for ticket"""
    return f"ticket:{ticket_id}"


def get_tickets_list_key(status: Optional[str] = None, department: Optional[str] = None) -> str:
    """Get cache key for tickets list"""
    key = "tickets:list"
    if status:
        key += f":status:{status}"
    if department:
        key += f":dept:{department}"
    return key


def get_bus_key(bus_id: str) -> str:
    """Get cache key for bus"""
    return f"bus:{bus_id}"


def get_buses_list_key() -> str:
    """Get cache key for buses list"""
    return "buses:list"


def get_impact_key() -> str:
    """Get cache key for impact metrics"""
    return "analytics:impact"


def get_road_health_key() -> str:
    """Get cache key for road health"""
    return "analytics:road_health"


# ============================================================================
# Cache Operations
# ============================================================================

def cache_event(event_id: int, event_data: Dict[str, Any]) -> bool:
    """Cache an event"""
    return redis_cache.set(get_event_key(event_id), event_data, CACHE_EVENT_TIMEOUT)


def get_cached_event(event_id: int) -> Optional[Dict[str, Any]]:
    """Get cached event"""
    return redis_cache.get(get_event_key(event_id))


def cache_events_list(events: List[Dict[str, Any]], event_type: Optional[str] = None, 
                      bus_id: Optional[str] = None) -> bool:
    """Cache events list"""
    return redis_cache.set(get_events_list_key(event_type, bus_id), events, CACHE_EVENT_TIMEOUT)


def get_cached_events_list(event_type: Optional[str] = None, bus_id: Optional[str] = None) -> Optional[List]:
    """Get cached events list"""
    return redis_cache.get(get_events_list_key(event_type, bus_id))


def invalidate_events_cache(event_type: Optional[str] = None, bus_id: Optional[str] = None) -> int:
    """Invalidate events cache"""
    pattern = get_events_list_key(event_type, bus_id) + "*"
    return redis_cache.clear_pattern(pattern)


def cache_stats(stats_data: Dict[str, Any]) -> bool:
    """Cache stats"""
    return redis_cache.set(get_stats_key(), stats_data, CACHE_STATS_TIMEOUT)


def get_cached_stats() -> Optional[Dict[str, Any]]:
    """Get cached stats"""
    return redis_cache.get(get_stats_key())


def cache_heatmap(points: List[Dict[str, float]]) -> bool:
    """Cache heatmap points"""
    return redis_cache.set(get_heatmap_key(), points, CACHE_EVENT_TIMEOUT)


def get_cached_heatmap() -> Optional[List]:
    """Get cached heatmap points"""
    return redis_cache.get(get_heatmap_key())


def cache_ticket(ticket_id: str, ticket_data: Dict[str, Any]) -> bool:
    """Cache a ticket"""
    return redis_cache.set(get_ticket_key(ticket_id), ticket_data, CACHE_TICKET_TIMEOUT)


def get_cached_ticket(ticket_id: str) -> Optional[Dict[str, Any]]:
    """Get cached ticket"""
    return redis_cache.get(get_ticket_key(ticket_id))


def invalidate_ticket_cache(ticket_id: str) -> bool:
    """Invalidate ticket cache"""
    return redis_cache.delete(get_ticket_key(ticket_id))


def cache_tickets_list(tickets: List[Dict[str, Any]], status: Optional[str] = None,
                       department: Optional[str] = None) -> bool:
    """Cache tickets list"""
    return redis_cache.set(get_tickets_list_key(status, department), tickets, CACHE_TICKET_TIMEOUT)


def get_cached_tickets_list(status: Optional[str] = None, department: Optional[str] = None) -> Optional[List]:
    """Get cached tickets list"""
    return redis_cache.get(get_tickets_list_key(status, department))


def invalidate_tickets_cache() -> int:
    """Invalidate all tickets cache"""
    return redis_cache.clear_pattern("tickets:list*")


def cache_buses(buses: List[Dict[str, Any]]) -> bool:
    """Cache buses list"""
    return redis_cache.set(get_buses_list_key(), buses, CACHE_BUS_TIMEOUT)


def get_cached_buses() -> Optional[List]:
    """Get cached buses"""
    return redis_cache.get(get_buses_list_key())


def cache_impact(impact_data: Dict[str, Any]) -> bool:
    """Cache impact metrics"""
    return redis_cache.set(get_impact_key(), impact_data, CACHE_STATS_TIMEOUT)


def get_cached_impact() -> Optional[Dict[str, Any]]:
    """Get cached impact metrics"""
    return redis_cache.get(get_impact_key())


def cache_road_health(health_data: Dict[str, Any]) -> bool:
    """Cache road health data"""
    return redis_cache.set(get_road_health_key(), health_data, CACHE_STATS_TIMEOUT)


def get_cached_road_health() -> Optional[Dict[str, Any]]:
    """Get cached road health"""
    return redis_cache.get(get_road_health_key())


def invalidate_analytics_cache() -> int:
    """Invalidate all analytics cache"""
    redis_cache.delete(get_impact_key())
    return redis_cache.delete(get_road_health_key())