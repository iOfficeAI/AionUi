"""Unit tests for notebookmd.capture module."""

import sys
import pytest
from notebookmd.capture import capture_streams, CapturedOutput, render_stdout


def test_captured_output_defaults():
    """Test CapturedOutput default values."""
    captured = CapturedOutput()

    assert captured.stdout == ""
    assert captured.stderr == ""
    assert captured.exception is None
    assert not captured.has_stdout
    assert not captured.has_stderr
    assert not captured.has_error


def test_has_stdout_property():
    """Test has_stdout property returns True if stdout non-empty."""
    captured = CapturedOutput()
    captured.stdout = "Hello"

    assert captured.has_stdout


def test_has_stderr_property():
    """Test has_stderr property returns True if stderr non-empty."""
    captured = CapturedOutput()
    captured.stderr = "Error message"

    assert captured.has_stderr


def test_has_error_property():
    """Test has_error property returns True if exception set."""
    captured = CapturedOutput()
    captured.exception = ValueError("Test error")

    assert captured.has_error


def test_capture_stdout():
    """Test capture_streams captures print statements to result.stdout."""
    with capture_streams(echo=False) as captured:
        print("Hello stdout")

    assert captured.has_stdout
    assert "Hello stdout" in captured.stdout
    assert not captured.has_stderr
    assert not captured.has_error


def test_capture_stderr():
    """Test capture_streams captures sys.stderr.write() to result.stderr."""
    with capture_streams(echo=False) as captured:
        sys.stderr.write("Hello stderr\n")

    assert captured.has_stderr
    assert "Hello stderr" in captured.stderr
    assert not captured.has_stdout
    assert not captured.has_error


def test_capture_exception():
    """Test capture_streams captures raised exception with traceback."""
    with capture_streams(echo=False) as captured:
        try:
            raise ValueError("Test error")
        except ValueError as e:
            captured.exception = e

    assert captured.has_error
    assert isinstance(captured.exception, ValueError)
    assert str(captured.exception) == "Test error"


def test_capture_echo_enabled(capsys):
    """Test output is printed when echo=True."""
    with capture_streams(echo=True) as captured:
        print("Hello")

    assert "Hello" in captured.stdout

    # Also check that it was printed to console
    out_captured = capsys.readouterr()
    assert "Hello" in out_captured.out


def test_capture_echo_disabled(capsys):
    """Test silent capture when echo=False."""
    with capture_streams(echo=False) as captured:
        print("Hello")

    assert "Hello" in captured.stdout

    # Verify nothing was printed to console
    out_captured = capsys.readouterr()
    assert out_captured.out == ""


def test_capture_mixed_output():
    """Test stdout + stderr captured correctly."""
    with capture_streams(echo=False) as captured:
        print("stdout message")
        sys.stderr.write("stderr message\n")

    assert captured.has_stdout
    assert captured.has_stderr
    assert "stdout message" in captured.stdout
    assert "stderr message" in captured.stderr


def test_render_stdout_basic():
    """Test stdout rendered as fenced code block."""
    result = render_stdout("Hello\nWorld")

    assert "**Output (stdout)**" in result
    assert "```" in result
    assert "Hello\nWorld" in result


def test_render_stderr_basic():
    """Test stderr rendered as fenced code block."""
    from notebookmd.capture import render_stderr
    result = render_stderr("Error\nMessage")

    assert "**Output (stderr)**" in result
    assert "```" in result
    assert "Error\nMessage" in result


def test_render_stdout_empty():
    """Test empty stdout returns empty string."""
    result = render_stdout("")

    assert result == ""


def test_render_exception_basic():
    """Test exception rendered as blockquote with type prefix."""
    from notebookmd.capture import render_exception

    try:
        raise ValueError("Test error")
    except ValueError as e:
        result = render_exception(e)

    assert "> **Error:**" in result
    assert "ValueError" in result
    assert "Test error" in result


def test_render_exception_multiline():
    """Test multiline traceback with > prefix."""
    from notebookmd.capture import render_exception

    try:
        def inner():
            raise RuntimeError("Inner error")
        inner()
    except RuntimeError as e:
        result = render_exception(e)

    assert "> **Error:**" in result
    assert "RuntimeError" in result
    assert "Inner error" in result
    # Check for blockquote formatting
    lines = result.split("\n")
    assert any(line.startswith(">") for line in lines)
