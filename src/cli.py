import argparse
import logging
import signal
from datetime import datetime

from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_EXECUTED
from apscheduler.schedulers.blocking import BlockingScheduler

from src.pipeline import run_pipeline
from src.settings import settings

logger = logging.getLogger(__name__)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ai-news-pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)

    run_parser = subparsers.add_parser("run", help="Run the fetch -> enrich -> export pipeline")
    mode = run_parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--once", action="store_true", help="Run a single cycle and exit")
    mode.add_argument("--loop", action="store_true", help="Run continuously on a schedule until interrupted")
    run_parser.add_argument(
        "--interval-minutes", type=int, default=None,
        help="Override settings.PIPELINE_INTERVAL_MINUTES for --loop mode",
    )

    return parser


def _print_banner() -> None:
    query_preview = settings.GDELT_QUERY if len(settings.GDELT_QUERY) <= 60 else settings.GDELT_QUERY[:57] + "..."
    logger.info("AI News Pipeline")
    logger.info("  GDELT query          : %s", query_preview)
    logger.info("  Ollama model         : %s (%s)", settings.OLLAMA_MODEL, settings.OLLAMA_BASE_URL)
    logger.info("  Database             : %s", settings.DB_PATH)
    logger.info("  Export target        : %s", settings.EXPORT_OUTPUT_PATH)
    logger.info("  Pipeline interval    : %s minute(s)", settings.PIPELINE_INTERVAL_MINUTES)


def run_loop(interval_minutes: int) -> None:
    scheduler = BlockingScheduler()
    job = scheduler.add_job(
        run_pipeline, "interval", minutes=interval_minutes,
        next_run_time=datetime.now(), max_instances=1,
    )

    def _on_job_event(event) -> None:
        if event.code == EVENT_JOB_ERROR:
            logger.error("Pipeline cycle raised an error: %s", event.exception)
        next_run = job.next_run_time
        if next_run:
            logger.info("Idle - next cycle at %s", next_run.strftime("%Y-%m-%d %H:%M:%S"))

    scheduler.add_listener(_on_job_event, EVENT_JOB_EXECUTED | EVENT_JOB_ERROR)

    def _shutdown(signum, _frame):
        logger.info("Signal %s received, shutting down scheduler...", signum)
        scheduler.shutdown(wait=False)

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    logger.info("Pipeline loop starting: every %s minute(s) (Ctrl+C to stop)", interval_minutes)
    scheduler.start()
    logger.info("Pipeline loop stopped")


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.command == "run":
        _print_banner()
        if args.once:
            run_pipeline()
        else:
            run_loop(args.interval_minutes or settings.PIPELINE_INTERVAL_MINUTES)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
