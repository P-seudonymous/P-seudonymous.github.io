import re
from fractions import Fraction
import sympy as sp

SPICE = "./digital_is_a_scam.spice"
OUT = "./output.txt"


def parse_mesh(lines):
    # using regex to parse the passive resistor mesh: R001..R226 and R_U1_BIAS.
    mesh_edges = []
    for ln in lines:
        m = re.match(r"^R(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s*$", ln.strip())
        if m:
            n1, n2, val = m.group(2), m.group(3), int(m.group(4))
            mesh_edges.append((n1, n2, val))
        m2 = re.match(r"^R_U1_BIAS\s+(\S+)\s+(\S+)\s+(\d+)\s*$", ln.strip())
        if m2:
            mesh_edges.append((m2.group(1), m2.group(2), int(m2.group(3))))
    return mesh_edges


def solve_mesh(mesh_edges):
    # collect all nodes
    nodes = set()
    for a, b, _ in mesh_edges:
        nodes.add(a)
        nodes.add(b)

    # discarding to remove known voltages so that we can only solve for variables.
    nodes.discard("0")
    nodes.discard("circus_dac")
    nodes = sorted(nodes)
    idx = {n: i for i, n in enumerate(nodes)}
    N = len(nodes)

    G = sp.zeros(N, N)  # conductance matrix
    I = sp.zeros(N, 1)  # current vector

    Vsrc = sp.Rational(1)  # test excitation: circus_dac = 1 V

    for a, b, val in mesh_edges:
        g = sp.Rational(1, val)  # g = 1/resistance
        if a == "0" or b == "0":
            other = b if a == "0" else a
            j = idx[other]
            G[j, j] += g  # node has path to gnd
        elif a == "circus_dac" or b == "circus_dac":
            other = b if a == "circus_dac" else a
            j = idx[other]
            G[j, j] += g
            I[j] += g * Vsrc  # node is injecting current
        else:
            i_, j = idx[a], idx[b]
            G[i_, i_] += g
            G[j, j] += g
            G[i_, j] -= g
            G[j, i_] -= g

    sol = G.solve(I)
    return sol[idx["net_tap"]]


def solve_opamp_chain(net_tap):
    U1_A, U1_RG, U1_RF = sp.Integer(700000043), sp.Integer(9137), sp.Integer(9821)
    U2_A, U2_RIN, U2_RF = sp.Integer(850000021), sp.Integer(12011), sp.Integer(24851)
    U3_A, U3_RG, U3_RF = sp.Integer(930000011), sp.Integer(15511), sp.Integer(19037)
    U4_A, U4_RIN, U4_RF = sp.Integer(760000033), sp.Integer(22307), sp.Integer(40163)

    CM1_RSET, CM1_RLOAD = sp.Integer(18713), sp.Integer(5711)
    CM2_RSET, CM2_RLOAD = sp.Integer(21089), sp.Integer(4987)
    CM3_RSET, CM3_RLOAD = sp.Integer(17401), sp.Integer(3907)

    gm1 = (sp.Rational(11, 4) / sp.Rational(8, 3)) / CM1_RSET
    gm2 = (sp.Rational(13, 3) / sp.Rational(5, 2)) / CM2_RSET
    gm3 = (sp.Rational(7, 4) / sp.Rational(9, 5)) / CM3_RSET

    # U1 -> non-inverting amp
    u1_n, u1_out = sp.symbols("u1_n u1_out")
    sol1 = sp.solve(
        [
            sp.Eq(u1_out, U1_A * (net_tap - u1_n)),
            sp.Eq(u1_n / U1_RG + (u1_n - u1_out) / U1_RF, 0),
        ],
        [u1_n, u1_out],
    )
    u1_out_v = sol1[u1_out]

    # CM1: G_CM1 cm1_out 0 u1_out 0 {gm1}, node order ->(na=cm1_out, nb=0)
    cm1_out_v = -gm1 * CM1_RLOAD * u1_out_v

    # U2 -> inverting amp
    u2_n, u2_out = sp.symbols("u2_n u2_out")
    sol2 = sp.solve(
        [
            sp.Eq(u2_out, U2_A * (0 - u2_n)),
            sp.Eq((u2_n - cm1_out_v) / U2_RIN + (u2_n - u2_out) / U2_RF, 0),
        ],
        [u2_n, u2_out],
    )
    u2_out_v = sol2[u2_out]

    # CM2: G_CM2 0 cm2_out u2_out 0 {gm2},  (node order REVERSED -> sign flips)
    cm2_out_v = gm2 * CM2_RLOAD * u2_out_v

    # U3 -> non-inverting amp
    u3_n, u3_out = sp.symbols("u3_n u3_out")
    sol3 = sp.solve(
        [
            sp.Eq(u3_out, U3_A * (cm2_out_v - u3_n)),
            sp.Eq(u3_n / U3_RG + (u3_n - u3_out) / U3_RF, 0),
        ],
        [u3_n, u3_out],
    )
    u3_out_v = sol3[u3_out]

    # CM3: G_CM3 cm3_out 0 u3_out 0 {gm3},  (same order as CM1)
    cm3_out_v = -gm3 * CM3_RLOAD * u3_out_v

    # U4 -> inverting amp
    u4_n, final_out = sp.symbols("u4_n final_out")
    sol4 = sp.solve(
        [
            sp.Eq(final_out, U4_A * (0 - u4_n)),
            sp.Eq((u4_n - cm3_out_v) / U4_RIN + (u4_n - final_out) / U4_RF, 0),
        ],
        [u4_n, final_out],
    )
    return sol4[final_out]


lines = open(SPICE).read().splitlines()
mesh_edges = parse_mesh(lines)
net_tap = solve_mesh(mesh_edges)
K = solve_opamp_chain(net_tap)  # K = final_out / circus_dac
K_frac = Fraction(int(sp.fraction(K)[0]), int(sp.fraction(K)[1]))

T_str = open(OUT).read().strip()
T_frac = Fraction(T_str)

circus = T_frac / K_frac
scaled = circus * (2**336)
n = round(scaled)

print(f"K (final_out/circus_dac)   = {float(K)!r}")
print(f"circus_dac                 = {float(circus)!r}")

bits = bin(n)[2:].zfill(336)
flag_bytes = int(bits, 2).to_bytes(42, "big")
print("FLAG:", flag_bytes.decode())
