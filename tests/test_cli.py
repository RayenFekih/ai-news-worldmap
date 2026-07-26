import pytest

from src.cli import build_parser, main


def test_run_once_parses():
    args = build_parser().parse_args(["run", "--once"])
    assert args.command == "run"
    assert args.once is True
    assert args.loop is False
    assert args.interval_minutes is None


def test_run_loop_parses_with_interval_override():
    args = build_parser().parse_args(["run", "--loop", "--interval-minutes", "5"])
    assert args.loop is True
    assert args.interval_minutes == 5


def test_once_and_loop_are_mutually_exclusive():
    with pytest.raises(SystemExit):
        build_parser().parse_args(["run", "--once", "--loop"])


def test_once_or_loop_is_required():
    with pytest.raises(SystemExit):
        build_parser().parse_args(["run"])


def test_main_once_invokes_run_pipeline(mocker):
    mock_run_pipeline = mocker.patch("src.cli.run_pipeline", return_value="ok")

    exit_code = main(["run", "--once"])

    assert exit_code == 0
    mock_run_pipeline.assert_called_once()


def test_main_loop_invokes_run_loop_with_configured_interval(mocker):
    mock_run_loop = mocker.patch("src.cli.run_loop")
    mocker.patch("src.cli.settings.PIPELINE_INTERVAL_MINUTES", 15)

    main(["run", "--loop"])

    mock_run_loop.assert_called_once_with(15)


def test_main_loop_invokes_run_loop_with_override(mocker):
    mock_run_loop = mocker.patch("src.cli.run_loop")

    main(["run", "--loop", "--interval-minutes", "7"])

    mock_run_loop.assert_called_once_with(7)
