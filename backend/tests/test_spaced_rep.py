"""
Unit tests for services/spaced_repetition.py — SM-2 algorithm.

These tests have NO external dependencies (no DB, no network).
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:x@localhost/x")

from services.spaced_repetition import SpacedRepetitionService


class TestSM2Algorithm:
    """Tests for the SM-2 spaced repetition algorithm."""

    def setup_method(self):
        self.srs = SpacedRepetitionService()

    # --- Correct responses ---

    def test_first_correct_review(self):
        """First correct review → interval = 1 day."""
        result = self.srs.calculate_next_review(
            quality=4, repetitions=0, ease_factor=2.5, interval=0
        )
        assert result["interval"] == 1
        assert result["repetitions"] == 1

    def test_second_correct_review(self):
        """Second correct review → interval = 6 days."""
        result = self.srs.calculate_next_review(
            quality=4, repetitions=1, ease_factor=2.5, interval=1
        )
        assert result["interval"] == 6
        assert result["repetitions"] == 2

    def test_third_correct_review(self):
        """Third+ correct review → interval = previous * ease_factor."""
        result = self.srs.calculate_next_review(
            quality=4, repetitions=2, ease_factor=2.5, interval=6
        )
        assert result["interval"] == 15  # int(6 * 2.5)
        assert result["repetitions"] == 3

    def test_perfect_quality_increases_ease(self):
        """Quality=5 should increase ease factor."""
        result = self.srs.calculate_next_review(
            quality=5, repetitions=2, ease_factor=2.5, interval=6
        )
        assert result["ease_factor"] > 2.5

    # --- Incorrect responses ---

    def test_incorrect_resets_interval(self):
        """Any quality < 3 resets interval to 1 and repetitions to 0."""
        result = self.srs.calculate_next_review(
            quality=1, repetitions=5, ease_factor=2.5, interval=30
        )
        assert result["interval"] == 1
        assert result["repetitions"] == 0

    def test_quality_zero_resets(self):
        result = self.srs.calculate_next_review(
            quality=0, repetitions=3, ease_factor=2.5, interval=15
        )
        assert result["interval"] == 1
        assert result["repetitions"] == 0

    # --- Ease factor boundaries ---

    def test_ease_factor_never_below_minimum(self):
        """Ease factor should never go below 1.3."""
        result = self.srs.calculate_next_review(
            quality=0, repetitions=0, ease_factor=1.3, interval=1
        )
        assert result["ease_factor"] >= 1.3

    def test_ease_factor_never_above_maximum(self):
        """Ease factor should never exceed 3.0."""
        result = self.srs.calculate_next_review(
            quality=5, repetitions=10, ease_factor=3.0, interval=100
        )
        assert result["ease_factor"] <= 3.0

    # --- next_review field ---

    def test_next_review_is_in_future(self):
        from datetime import datetime
        result = self.srs.calculate_next_review(
            quality=4, repetitions=0, ease_factor=2.5, interval=0
        )
        assert result["next_review"] > datetime.utcnow()


class TestDifficultyLabel:
    def setup_method(self):
        self.srs = SpacedRepetitionService()

    def test_easy(self):
        assert self.srs.get_difficulty_label(2.5) == "easy"
        assert self.srs.get_difficulty_label(3.0) == "easy"

    def test_medium(self):
        assert self.srs.get_difficulty_label(2.0) == "medium"
        assert self.srs.get_difficulty_label(2.4) == "medium"

    def test_hard(self):
        assert self.srs.get_difficulty_label(1.3) == "hard"
        assert self.srs.get_difficulty_label(1.9) == "hard"


class TestRetentionProbability:
    def setup_method(self):
        self.srs = SpacedRepetitionService()

    def test_same_day_high_retention(self):
        """Same day review should have high retention."""
        p = self.srs.calculate_retention_probability(0, 10)
        assert p == 1.0

    def test_retention_decreases_over_time(self):
        p1 = self.srs.calculate_retention_probability(1, 10)
        p2 = self.srs.calculate_retention_probability(5, 10)
        assert p1 > p2

    def test_zero_interval_returns_zero(self):
        assert self.srs.calculate_retention_probability(5, 0) == 0.0

    def test_retention_between_zero_and_one(self):
        p = self.srs.calculate_retention_probability(3, 7)
        assert 0.0 <= p <= 1.0
