from datetime import datetime, timedelta
from typing import Dict


class SpacedRepetitionService:
    """SM-2 Spaced Repetition Algorithm implementation."""
    
    def __init__(self):
        self.min_ease_factor = 1.3
        self.max_ease_factor = 3.0
    
    def calculate_next_review(
        self,
        quality: int,
        repetitions: int,
        ease_factor: float,
        interval: int
    ) -> Dict:
        """
        Calculate next review parameters using SM-2 algorithm.
        
        Args:
            quality: User rating 0-5
                0 - Complete blackout, no recall
                1 - Incorrect, but remembered upon seeing answer
                2 - Incorrect, but answer seemed easy to recall
                3 - Correct, but with significant difficulty
                4 - Correct, after some hesitation
                5 - Perfect recall
            repetitions: Number of times card has been reviewed
            ease_factor: Current ease factor (2.5 default)
            interval: Current interval in days
        
        Returns:
            Dict with new_ease_factor, new_interval, new_repetitions, next_review
        """
        # Calculate new ease factor
        new_ease_factor = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        new_ease_factor = max(self.min_ease_factor, min(self.max_ease_factor, new_ease_factor))
        
        if quality >= 3:
            # Correct response
            if repetitions == 0:
                new_interval = 1
            elif repetitions == 1:
                new_interval = 6
            else:
                new_interval = int(interval * new_ease_factor)
            
            new_repetitions = repetitions + 1
        else:
            # Incorrect response - reset
            new_interval = 1
            new_repetitions = 0
        
        # Calculate next review date
        next_review = datetime.utcnow() + timedelta(days=new_interval)
        
        return {
            "ease_factor": round(new_ease_factor, 2),
            "interval": new_interval,
            "repetitions": new_repetitions,
            "next_review": next_review
        }
    
    def get_difficulty_label(self, ease_factor: float) -> str:
        """Get human-readable difficulty label based on ease factor."""
        if ease_factor >= 2.5:
            return "easy"
        elif ease_factor >= 2.0:
            return "medium"
        else:
            return "hard"
    
    def calculate_retention_probability(self, days_since_review: int, interval: int) -> float:
        """
        Estimate probability of remembering based on forgetting curve.
        
        Uses approximate forgetting curve: R = e^(-t/S)
        where t is time elapsed and S is stability (interval)
        """
        import math
        
        if interval <= 0:
            return 0.0
        
        retention = math.exp(-days_since_review / interval)
        return round(retention, 2)
