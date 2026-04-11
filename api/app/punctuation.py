from __future__ import annotations
import re
from dataclasses import dataclass

try:
    from razdel import tokenize as razdel_tokenize
except Exception:  # pragma: no cover
    razdel_tokenize = None

try:
    from pymorphy3 import MorphAnalyzer
except Exception:  # pragma: no cover
    MorphAnalyzer = None


@dataclass(frozen=True)
class Rule:
    pattern: str
    replacement: str
    explanation: str
    flags: int = re.IGNORECASE


MORPH = MorphAnalyzer() if MorphAnalyzer else None
SUBORDINATE = {"что", "чтобы", "если", "когда", "хотя", "пока", "будто", "словно"}
COMPOUND = {"потому что", "так как", "так что", "как только", "прежде чем", "несмотря на то что", "в то время как"}
RELATIVE = {"который", "которая", "которое", "которые", "где", "куда", "откуда"}
ADVERSATIVE = {"но", "а", "однако", "зато"}
INTRO = {"конечно", "наверное", "возможно", "по-моему", "к счастью", "к сожалению", "во-первых", "во-вторых"}


def _cleanup(text: str) -> str:
    text = re.sub(r"\s+,", ",", text)
    text = re.sub(r",\s*,", ",", text)
    text = re.sub(r"\s{2,}", " ", text).strip()
    text = re.sub(r"([.!?])([А-Яа-яЁё])", r"\1 \2", text)
    return text


def _tokenize(sentence: str) -> list[str]:
    if razdel_tokenize:
        return [t.text for t in razdel_tokenize(sentence)]
    return re.findall(r"[А-Яа-яЁёA-Za-z-]+|\d+|[^\w\s]", sentence, flags=re.UNICODE)


def _is_word(tok: str) -> bool:
    return bool(re.fullmatch(r"[А-Яа-яЁёA-Za-z-]+", tok))


def _pos(tok: str) -> str:
    if not MORPH or not _is_word(tok):
        return ""
    try:
        return MORPH.parse(tok)[0].tag.POS or ""
    except Exception:
        return ""


def _looks_like_predicate(tok: str) -> bool:
    pos = _pos(tok)
    low = tok.lower()
    if pos in {"VERB", "INFN", "PRTS", "PRTF", "GRND"}:
        return True
    if low in {"был", "была", "были", "будет", "есть", "смогу", "хочу", "знаю", "думаю", "сказал", "понял", "приду", "успею"}:
        return True
    return bool(re.search(r"(ет|ут|ют|ит|ат|ят|ешь|ишь|ем|им|ем|им|у|ю|ал|ала|али|ило|ился|илась|ятся|ется)$", low))


def _has_predicate(tokens: list[str], start: int, end: int) -> bool:
    for tok in tokens[max(0, start):min(len(tokens), end)]:
        if _looks_like_predicate(tok):
            return True
    return False


def _join_tokens(tokens: list[str]) -> str:
    text = ""
    no_space_before = {",", ".", "!", "?", ";", ":"}
    no_space_after = {"(", "«", '"'}
    for i, tok in enumerate(tokens):
        if not text:
            text = tok
            continue
        prev = tokens[i-1]
        if tok in no_space_before or prev in no_space_after:
            text += tok
        else:
            text += " " + tok
    text = text.replace("« ", "«").replace(" »", "»")
    return _cleanup(text)


def _insert_comma_before(tokens: list[str], index: int) -> bool:
    if index <= 0:
        return False
    if tokens[index-1] == ",":
        return False
    tokens.insert(index, ",")
    return True


def _insert_comma_after(tokens: list[str], index: int) -> bool:
    if index + 1 < len(tokens) and tokens[index+1] == ",":
        return False
    tokens.insert(index + 1, ",")
    return True


def _apply_token_rules(sentence: str) -> tuple[str, list[str]]:
    tokens = _tokenize(sentence)
    explanations: list[str] = []
    if not tokens:
        return sentence, explanations

    # Start-of-sentence introductory expressions
    joined_lower = " ".join(t.lower() for t in tokens[:4])
    for expr in sorted(INTRO, key=len, reverse=True):
        expr_tokens = expr.split()
        if [t.lower() for t in tokens[:len(expr_tokens)]] == expr_tokens:
            if len(tokens) > len(expr_tokens) and tokens[len(expr_tokens)] != ",":
                tokens.insert(len(expr_tokens), ",")
                explanations.append("Запятая после вводной конструкции в начале предложения.")
            break

    i = 0
    while i < len(tokens):
        low = tokens[i].lower()

        # compound conjunctions
        matched_compound = False
        for expr in sorted(COMPOUND, key=lambda x: -len(x.split())):
            parts = expr.split()
            if [t.lower() for t in tokens[i:i+len(parts)]] == parts:
                if _has_predicate(tokens, max(0, i-4), i) and _insert_comma_before(tokens, i):
                    explanations.append(f"Запятая перед союзом «{expr}».")
                    i += 1
                matched_compound = True
                break
        if matched_compound:
            i += 1
            continue

        # adversative conjunctions
        if low in ADVERSATIVE and _has_predicate(tokens, max(0, i-4), i) and _has_predicate(tokens, i+1, i+6):
            if _insert_comma_before(tokens, i):
                explanations.append(f"Запятая перед противительным союзом «{low}».")
                i += 1

        # subordinate / relative words
        elif low in SUBORDINATE or low in RELATIVE:
            prev_low = tokens[i-1].lower() if i > 0 else ""
            if low == "что" and prev_low in {"потому", "так"}:
                i += 1
                continue
            if _has_predicate(tokens, max(0, i-5), i):
                if _insert_comma_before(tokens, i):
                    kind = "союзным словом" if low in RELATIVE else "союзом"
                    explanations.append(f"Запятая перед придаточным с {kind} «{low}».")
                    i += 1

        i += 1
    # Leading clauses like "Когда ... я ..."
    starts = [("когда", "времени"), ("если", "условия"), ("хотя", "уступки"), ("пока", "времени")]
    lower_tokens = [t.lower() for t in tokens]
    pronouns = {"я", "ты", "он", "она", "мы", "вы", "они", "это"}
    for first, label in starts:
        if lower_tokens and lower_tokens[0] == first:
            for j in range(1, min(len(tokens) - 1, 14)):
                if _looks_like_predicate(tokens[j]):
                    for k in range(j + 1, min(len(tokens), j + 8)):
                        if not _is_word(tokens[k]):
                            continue
                        pos = _pos(tokens[k])
                        if tokens[k].lower() in pronouns or pos in {"NOUN", "NPRO", "ADJF"}:
                            if k > 0 and tokens[k-1] != ",":
                                tokens.insert(k, ",")
                                explanations.append(f"Запятая после придаточного {label} с союзом «{first}».")
                            break
                    break


    # de-duplicate commas
    text = _join_tokens(tokens)
    text = re.sub(r",\s*,", ",", text)
    return text, list(dict.fromkeys(explanations))


def punctuate_text(text: str) -> dict:
    original = (text or "").strip()
    if not original:
        return {
            "original": original,
            "result": original,
            "explanations": ["Введите предложение для проверки."],
            "note": "Пунктуация зависит от смысла. Автоматический результат нужно перепроверять."
        }

    # regex pre-pass for the most stable school rules
    result = original
    regex_explanations: list[str] = []
    regex_rules = [
        Rule(r"(?<![,])\s+(потому что)\b", r", \1", "Запятая перед союзом «потому что»."),
        Rule(r"(?<![,])\s+(так как)\b", r", \1", "Запятая перед союзом «так как»."),
        Rule(r"(?<![,])\s+(так что)\b", r", \1", "Запятая перед союзом «так что»."),
        Rule(r"(?<![,])\s+(но)\s+", r", \1 ", "Запятая перед противительным союзом «но»."),
        Rule(r"(?<![,])\s+(а)\s+", r", \1 ", "Запятая перед союзом «а»."),
        Rule(r"(?<![,])\s+(чтобы)\b", r", \1", "Запятая перед придаточным с союзом «чтобы»."),
    ]
    for rule in regex_rules:
        updated, count = re.subn(rule.pattern, rule.replacement, result, flags=rule.flags)
        if count:
            result = updated
            regex_explanations.append(rule.explanation)

    # NLP-ish token/morphology pass
    result, nlp_explanations = _apply_token_rules(result)
    result = _cleanup(result)
    if result and result[-1] not in ".!?":
        result += "."

    explanations = list(dict.fromkeys(regex_explanations + nlp_explanations))
    if not explanations:
        explanations.append("Точного автоматического правила не найдено. Проверь пунктуацию вручную.")

    return {
        "original": original,
        "result": result,
        "explanations": explanations,
        "note": "Результат собран гибридно: регулярные правила + NLP-слой (токенизация и морфологические признаки). В сложных или авторских случаях обязательно перепроверь и при необходимости исправь вручную."
    }
